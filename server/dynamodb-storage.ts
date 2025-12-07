import {
    type User,
    type InsertUser,
    type Property,
    type InsertProperty,
    type Amenity,
    type InsertAmenity,
    type PropertyType,
    type InsertPropertyType,
} from '@shared/schema'
import {
    TABLES,
    DynamoDBUtils,
    executeWithRetry,
    generateId,
    toStringId,
    toNumericId,
    generateTimestamp,
} from './dynamodb'
import type { IStorage } from './storage'

export class DynamoDBStorage implements IStorage {
    // User methods
    async getUser(id: number): Promise<User | undefined> {
        return executeWithRetry(async () => {
            const item = await DynamoDBUtils.getItem(TABLES.USERS, { id: toStringId(id) })
            return item ? this.convertUserFromDynamoDB(item) : undefined
        })
    }

    async getUserByUsername(username: string): Promise<User | undefined> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(
                TABLES.USERS,
                '#username = :username',
                { ':username': username },
                { '#username': 'username' }
            )
            return items.length > 0 ? this.convertUserFromDynamoDB(items[0]) : undefined
        })
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(
                TABLES.USERS,
                '#email = :email',
                { ':email': email },
                { '#email': 'email' }
            )
            return items.length > 0 ? this.convertUserFromDynamoDB(items[0]) : undefined
        })
    }

    async getUserByVerificationToken(token: string): Promise<User | undefined> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(
                TABLES.USERS,
                '#emailVerificationToken = :token',
                { ':token': token },
                { '#emailVerificationToken': 'emailVerificationToken' }
            )
            return items.length > 0 ? this.convertUserFromDynamoDB(items[0]) : undefined
        })
    }

    async getAllUsers(): Promise<User[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(TABLES.USERS)
            return items.map((item) => this.convertUserFromDynamoDB(item))
        })
    }

    async createUser(insertUser: InsertUser): Promise<User> {
        return executeWithRetry(async () => {
            const id = generateId()
            const timestamp = generateTimestamp()
            const user = {
                ...insertUser,
                id: toStringId(id),
                createdAt: timestamp,
                updatedAt: timestamp,
            }
            console.log('CREATE USER: Generated user ID:', user.id, '(Type:', typeof user.id + ')')

            await DynamoDBUtils.putItem(TABLES.USERS, user)
            return this.convertUserFromDynamoDB(user)
        })
    }

    async updateUser(userId: number, userUpdate: Partial<User>): Promise<User> {
        return executeWithRetry(async () => {
            // Build update expression
            const updateExpressions: string[] = []
            const expressionAttributeValues: any = { ':updatedAt': generateTimestamp() }
            const expressionAttributeNames: any = { '#updatedAt': 'updatedAt' }

            Object.entries(userUpdate).forEach(([key, value]) => {
                if (key !== 'id' && value !== undefined) {
                    updateExpressions.push(`#${key} = :${key}`)
                    expressionAttributeValues[`:${key}`] = value
                    expressionAttributeNames[`#${key}`] = key
                }
            })

            updateExpressions.push('#updatedAt = :updatedAt')

            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.USERS,
                { id: toStringId(userId) },
                `SET ${updateExpressions.join(', ')}`,
                expressionAttributeValues,
                expressionAttributeNames
            )

            if (!updatedItem) {
                throw new Error(`User with ID ${userId} not found`)
            }

            return this.convertUserFromDynamoDB(updatedItem)
        })
    }

    async updateUserRole(userId: number, role: string): Promise<User> {
        return executeWithRetry(async () => {
            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.USERS,
                { id: toStringId(userId) },
                'SET #role = :role, #updatedAt = :updatedAt',
                { ':role': role, ':updatedAt': generateTimestamp() },
                { '#role': 'role', '#updatedAt': 'updatedAt' }
            )

            if (!updatedItem) {
                throw new Error(`User with ID ${userId} not found`)
            }

            return this.convertUserFromDynamoDB(updatedItem)
        })
    }

    async verifyUser(userId: number): Promise<User> {
        return executeWithRetry(async () => {
            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.USERS,
                { id: toStringId(userId) },
                'SET #isVerified = :isVerified, #emailVerificationToken = :token, #emailVerificationExpires = :expires, #updatedAt = :updatedAt',
                {
                    ':isVerified': true,
                    ':token': null,
                    ':expires': null,
                    ':updatedAt': generateTimestamp(),
                },
                {
                    '#isVerified': 'isVerified',
                    '#emailVerificationToken': 'emailVerificationToken',
                    '#emailVerificationExpires': 'emailVerificationExpires',
                    '#updatedAt': 'updatedAt',
                }
            )

            if (!updatedItem) {
                throw new Error(`User with ID ${userId} not found`)
            }

            return this.convertUserFromDynamoDB(updatedItem)
        })
    }

    async updateVerificationToken(userId: number, token: string, expiry: string): Promise<User> {
        return executeWithRetry(async () => {
            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.USERS,
                { id: toStringId(userId) },
                'SET #emailVerificationToken = :token, #emailVerificationExpires = :expires, #updatedAt = :updatedAt',
                {
                    ':token': token,
                    ':expires': expiry,
                    ':updatedAt': generateTimestamp(),
                },
                {
                    '#emailVerificationToken': 'emailVerificationToken',
                    '#emailVerificationExpires': 'emailVerificationExpires',
                    '#updatedAt': 'updatedAt',
                }
            )

            if (!updatedItem) {
                throw new Error(`User with ID ${userId} not found`)
            }

            return this.convertUserFromDynamoDB(updatedItem)
        })
    }

    // Property methods
    async getAllProperties(): Promise<Property[]> {
        return executeWithRetry(async () => {
            try {
                const items = await DynamoDBUtils.scanTable(TABLES.PROPERTIES)
                const convertedItems = await Promise.all(items.map((item) => this.convertPropertyFromDynamoDB(item)))
                return convertedItems.sort((a, b) => b.id - a.id) // Sort by ID descending (newest first)
            } catch (error) {
                console.error('Error in getAllProperties:', error)
                throw error
            }
        })
    }

    async getProperty(id: number): Promise<Property | undefined> {
        return executeWithRetry(async () => {
            const item = await DynamoDBUtils.getItem(TABLES.PROPERTIES, { id: toStringId(id) })
            return item ? this.convertPropertyFromDynamoDB(item) : undefined
        })
    }

    async getFeaturedProperties(): Promise<Property[]> {
        return executeWithRetry(async () => {
            try {
                const items = await DynamoDBUtils.scanTable(
                    TABLES.PROPERTIES,
                    '#isFeatured = :isFeatured',
                    { ':isFeatured': true },
                    { '#isFeatured': 'isFeatured' }
                )
                const convertedItems = await Promise.all(items.map((item) => this.convertPropertyFromDynamoDB(item)))
                return convertedItems.sort((a, b) => b.id - a.id).slice(0, 4)
            } catch (error) {
                console.error('Error in getFeaturedProperties:', error)
                throw error
            }
        })
    }

    async getPropertiesByCategory(category: string): Promise<Property[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(
                TABLES.PROPERTIES,
                '#category = :category',
                { ':category': category },
                { '#category': 'category' }
            )
            const convertedItems = await Promise.all(items.map((item) => this.convertPropertyFromDynamoDB(item)))
            return convertedItems.sort((a, b) => b.id - a.id)
        })
    }

    async searchProperties(query: string): Promise<Property[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(
                TABLES.PROPERTIES,
                'contains(#title, :query) OR contains(#location, :query) OR contains(#propertyType, :query) OR contains(#description, :query)',
                { ':query': query },
                {
                    '#title': 'title',
                    '#location': 'location',
                    '#propertyType': 'propertyType',
                    '#description': 'description',
                }
            )
            const convertedItems = await Promise.all(items.map((item) => this.convertPropertyFromDynamoDB(item)))
            return convertedItems.sort((a, b) => b.id - a.id)
        })
    }

    async filterProperties(filters: Partial<Property>): Promise<Property[]> {
        return executeWithRetry(async () => {
            let filterExpression = ''
            const expressionAttributeValues: any = {}
            const expressionAttributeNames: any = {}
            const conditions: string[] = []

            // Build filter conditions
            if (filters.category) {
                conditions.push('#category = :category')
                expressionAttributeValues[':category'] = filters.category
                expressionAttributeNames['#category'] = 'category'
            }
            if (filters.propertyType) {
                conditions.push('#propertyType = :propertyType')
                expressionAttributeValues[':propertyType'] = filters.propertyType
                expressionAttributeNames['#propertyType'] = 'propertyType'
            }
            if (filters.bedrooms) {
                conditions.push('#bedrooms = :bedrooms')
                expressionAttributeValues[':bedrooms'] = filters.bedrooms
                expressionAttributeNames['#bedrooms'] = 'bedrooms'
            }
            if (filters.bathrooms) {
                conditions.push('#bathrooms = :bathrooms')
                expressionAttributeValues[':bathrooms'] = filters.bathrooms
                expressionAttributeNames['#bathrooms'] = 'bathrooms'
            }
            if (filters.isFeatured !== undefined && filters.isFeatured !== null) {
                conditions.push('#isFeatured = :isFeatured')
                expressionAttributeValues[':isFeatured'] = filters.isFeatured
                expressionAttributeNames['#isFeatured'] = 'isFeatured'
            }
            if (filters.isAvailable !== undefined && filters.isAvailable !== null) {
                conditions.push('#isAvailable = :isAvailable')
                expressionAttributeValues[':isAvailable'] = filters.isAvailable
                expressionAttributeNames['#isAvailable'] = 'isAvailable'
            }

            if (conditions.length > 0) {
                filterExpression = conditions.join(' AND ')
            }

            const items = await DynamoDBUtils.scanTable(
                TABLES.PROPERTIES,
                filterExpression || undefined,
                Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
                Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
            )

            let results = await Promise.all(items.map((item) => this.convertPropertyFromDynamoDB(item)))

            // Handle amenities filtering (DynamoDB doesn't support array contains operations easily)
            if (filters.amenities && Array.isArray(filters.amenities)) {
                results = results.filter((property) => {
                    if (!property.amenities || !Array.isArray(property.amenities)) return false
                    return filters.amenities!.every((amenity) => property.amenities!.includes(amenity))
                })
            }

            return results.sort((a, b) => b.id - a.id)
        })
    }

    async createProperty(insertProperty: InsertProperty): Promise<Property> {
        return executeWithRetry(async () => {
            const id = generateId()
            const timestamp = generateTimestamp()
            const property = {
                ...insertProperty,
                id: toStringId(id),
                viewCount: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
            }

            await DynamoDBUtils.putItem(TABLES.PROPERTIES, property)
            return await this.convertPropertyFromDynamoDB(property)
        })
    }

    async updateProperty(id: number, propertyUpdate: Partial<Property>): Promise<Property | undefined> {
        return executeWithRetry(async () => {
            // Build update expression
            const updateExpressions: string[] = []
            const expressionAttributeValues: any = { ':updatedAt': generateTimestamp() }
            const expressionAttributeNames: any = { '#updatedAt': 'updatedAt' }

            Object.entries(propertyUpdate).forEach(([key, value]) => {
                if (key !== 'id' && value !== undefined) {
                    updateExpressions.push(`#${key} = :${key}`)
                    expressionAttributeValues[`:${key}`] = value
                    expressionAttributeNames[`#${key}`] = key
                }
            })

            updateExpressions.push('#updatedAt = :updatedAt')

            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.PROPERTIES,
                { id: toStringId(id) },
                `SET ${updateExpressions.join(', ')}`,
                expressionAttributeValues,
                expressionAttributeNames
            )

            return updatedItem ? await this.convertPropertyFromDynamoDB(updatedItem) : undefined
        })
    }

    async deleteProperty(id: number): Promise<boolean> {
        return executeWithRetry(async () => {
            const deletedItem = await DynamoDBUtils.deleteItem(TABLES.PROPERTIES, { id: toStringId(id) })
            return !!deletedItem
        })
    }

    async incrementPropertyViewCount(id: number): Promise<Property | undefined> {
        return executeWithRetry(async () => {
            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.PROPERTIES,
                { id: toStringId(id) },
                'ADD #viewCount :increment SET #updatedAt = :updatedAt',
                { ':increment': 1, ':updatedAt': generateTimestamp() },
                { '#viewCount': 'viewCount', '#updatedAt': 'updatedAt' }
            )

            return updatedItem ? this.convertPropertyFromDynamoDB(updatedItem) : undefined
        })
    }

    async trackDetailedPropertyView(viewData: {
        propertyId: number
        userId?: number | null
        userAgent?: string
        referrer?: string
        ipAddress?: string
        timestamp: string
    }): Promise<void> {
        return executeWithRetry(async () => {
            const viewId = generateId()
            const item = {
                id: viewId,
                propertyId: toStringId(viewData.propertyId),
                userId: viewData.userId ? toStringId(viewData.userId) : null,
                userAgent: viewData.userAgent || null,
                referrer: viewData.referrer || null,
                ipAddress: viewData.ipAddress || null,
                timestamp: viewData.timestamp,
                createdAt: generateTimestamp(),
            }

            await DynamoDBUtils.putItem(TABLES.PROPERTY_VIEWS, item)
        })
    }

    async getPropertyViewAnalytics(propertyId: number): Promise<{
        totalViews: number
        uniqueViews: number
        viewsByDate: Array<{ date: string; count: number }>
        viewsByHour: Array<{ hour: number; count: number }>
        topReferrers: Array<{ referrer: string; count: number }>
        recentViews: Array<{ timestamp: string; userAgent?: string; ipAddress?: string }>
    }> {
        return executeWithRetry(async () => {
            // Get all views for this property
            const views = await DynamoDBUtils.query(TABLES.PROPERTY_VIEWS, 'propertyId = :propertyId', {
                ':propertyId': toStringId(propertyId),
            })

            if (!views || views.length === 0) {
                return {
                    totalViews: 0,
                    uniqueViews: 0,
                    viewsByDate: [],
                    viewsByHour: [],
                    topReferrers: [],
                    recentViews: [],
                }
            }

            // Calculate analytics
            const totalViews = views.length
            const uniqueIPs = new Set(views.map((v: any) => v.ipAddress).filter((ip: any) => ip))
            const uniqueViews = uniqueIPs.size

            // Group by date
            const viewsByDate = new Map<string, number>()
            views.forEach((view: any) => {
                const date = view.timestamp.split('T')[0]
                viewsByDate.set(date, (viewsByDate.get(date) || 0) + 1)
            })

            // Group by hour
            const viewsByHour = new Map<number, number>()
            views.forEach((view: any) => {
                const hour = new Date(view.timestamp).getHours()
                viewsByHour.set(hour, (viewsByHour.get(hour) || 0) + 1)
            })

            // Top referrers
            const referrerCounts = new Map<string, number>()
            views.forEach((view: any) => {
                if (view.referrer) {
                    referrerCounts.set(view.referrer, (referrerCounts.get(view.referrer) || 0) + 1)
                }
            })

            // Recent views (last 10)
            const recentViews = views
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10)
                .map((view: any) => ({
                    timestamp: view.timestamp,
                    userAgent: view.userAgent,
                    ipAddress: view.ipAddress,
                }))

            return {
                totalViews,
                uniqueViews,
                viewsByDate: Array.from(viewsByDate.entries()).map(([date, count]) => ({ date, count })),
                viewsByHour: Array.from(viewsByHour.entries()).map(([hour, count]) => ({ hour, count })),
                topReferrers: Array.from(referrerCounts.entries())
                    .map(([referrer, count]) => ({ referrer, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10),
                recentViews,
            }
        })
    }

    async getAgentAnalytics(agentId: number): Promise<{
        totalProperties: number
        totalViews: number
        averageViewsPerProperty: number
        topPerformingProperty: Property | null
        viewsThisMonth: number
        viewsLastMonth: number
        growthRate: number
        propertiesByCategory: Array<{ category: string; count: number }>
    }> {
        return executeWithRetry(async () => {
            // Get agent's properties
            const properties = await this.getPropertiesByOwner(agentId)
            const totalProperties = properties.length

            if (totalProperties === 0) {
                return {
                    totalProperties: 0,
                    totalViews: 0,
                    averageViewsPerProperty: 0,
                    topPerformingProperty: null,
                    viewsThisMonth: 0,
                    viewsLastMonth: 0,
                    growthRate: 0,
                    propertiesByCategory: [],
                }
            }

            // Calculate total views
            const totalViews = properties.reduce((sum, prop) => sum + (prop.viewCount || 0), 0)
            const averageViewsPerProperty = totalViews / totalProperties

            // Find top performing property
            const topPerformingProperty = properties.reduce(
                (top, prop) => ((prop.viewCount || 0) > (top?.viewCount || 0) ? prop : top),
                null as Property | null
            )

            // Calculate monthly views (mock data for now)
            const viewsThisMonth = Math.floor(totalViews * 0.3)
            const viewsLastMonth = Math.floor(totalViews * 0.25)
            const growthRate = viewsLastMonth > 0 ? ((viewsThisMonth - viewsLastMonth) / viewsLastMonth) * 100 : 0

            // Group properties by category
            const categoryCounts = new Map<string, number>()
            properties.forEach((prop) => {
                const category = prop.category || 'unknown'
                categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)
            })

            const propertiesByCategory = Array.from(categoryCounts.entries()).map(([category, count]) => ({
                category,
                count,
            }))

            return {
                totalProperties,
                totalViews,
                averageViewsPerProperty,
                topPerformingProperty,
                viewsThisMonth,
                viewsLastMonth,
                growthRate,
                propertiesByCategory,
            }
        })
    }

    async getAdminAnalytics(): Promise<{
        totalProperties: number
        totalUsers: number
        totalViews: number
        topAgents: Array<{ agentId: number; agentName: string; propertyCount: number; totalViews: number }>
        topProperties: Array<{ propertyId: number; title: string; viewCount: number; ownerName: string }>
        viewsByCategory: Array<{ category: string; count: number }>
        recentActivity: Array<{ type: string; description: string; timestamp: string }>
    }> {
        return executeWithRetry(async () => {
            // Get all properties and users
            const properties = await this.getAllProperties()
            const users = await this.getAllUsers()

            const totalProperties = properties.length
            const totalUsers = users.length
            const totalViews = properties.reduce((sum, prop) => sum + (prop.viewCount || 0), 0)

            // Get top agents
            const agentStats = new Map<number, { propertyCount: number; totalViews: number; agentName: string }>()
            properties.forEach((prop) => {
                if (prop.ownerId) {
                    const agent = users.find((u) => u.id === prop.ownerId)
                    if (agent) {
                        const current = agentStats.get(prop.ownerId) || {
                            propertyCount: 0,
                            totalViews: 0,
                            agentName: agent.fullName,
                        }
                        current.propertyCount++
                        current.totalViews += prop.viewCount || 0
                        agentStats.set(prop.ownerId, current)
                    }
                }
            })

            const topAgents = Array.from(agentStats.entries())
                .map(([agentId, stats]) => ({
                    agentId,
                    agentName: stats.agentName,
                    propertyCount: stats.propertyCount,
                    totalViews: stats.totalViews,
                }))
                .sort((a, b) => b.totalViews - a.totalViews)
                .slice(0, 10)

            // Get top properties
            const topProperties = properties
                .map((prop) => {
                    const owner = users.find((u) => u.id === prop.ownerId)
                    return {
                        propertyId: prop.id,
                        title: prop.title,
                        viewCount: prop.viewCount || 0,
                        ownerName: owner?.fullName || 'Unknown',
                    }
                })
                .sort((a, b) => b.viewCount - a.viewCount)
                .slice(0, 10)

            // Group views by category
            const categoryViews = new Map<string, number>()
            properties.forEach((prop) => {
                const category = prop.category || 'unknown'
                categoryViews.set(category, (categoryViews.get(category) || 0) + (prop.viewCount || 0))
            })

            const viewsByCategory = Array.from(categoryViews.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count)

            // Mock recent activity
            const recentActivity = [
                {
                    type: 'property_added',
                    description: 'New property added by agent',
                    timestamp: new Date().toISOString(),
                },
                {
                    type: 'view_tracked',
                    description: 'Property view recorded',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                },
                {
                    type: 'user_registered',
                    description: 'New user registered',
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                },
            ]

            return {
                totalProperties,
                totalUsers,
                totalViews,
                topAgents,
                topProperties,
                viewsByCategory,
                recentActivity,
            }
        })
    }

    async getPopularProperties(limit: number = 4): Promise<Property[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(TABLES.PROPERTIES)
            return items
                .map((item) => this.convertPropertyFromDynamoDB(item))
                .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0) || b.id - a.id)
                .slice(0, limit)
        })
    }

    async getRecentlyAddedProperties(limit: number = 4): Promise<Property[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(TABLES.PROPERTIES)
            return items
                .map((item) => this.convertPropertyFromDynamoDB(item))
                .sort((a, b) => b.id - a.id)
                .slice(0, limit)
        })
    }

    async getPropertiesByOwner(ownerId: number): Promise<Property[]> {
        return executeWithRetry(async () => {
            console.log('=== GET PROPERTIES BY OWNER ===')
            console.log('Looking for ownerId:', ownerId)
            console.log('OwnerId type:', typeof ownerId)

            const items = await DynamoDBUtils.scanTable(TABLES.PROPERTIES)
            console.log('Total properties found:', items.length)
            console.log(
                'All properties:',
                items.map((item) => ({ id: item.id, ownerId: item.ownerId, title: item.title }))
            )

            // Filter properties by ownerId
            const filteredItems = items.filter((item) => {
                console.log(
                    'Checking property:',
                    item.id,
                    'ownerId:',
                    item.ownerId,
                    'ownerId type:',
                    typeof item.ownerId
                )
                // If the property has an ownerId, check if it matches
                if (item.ownerId !== undefined && item.ownerId !== null) {
                    const numericOwnerId = toNumericId(item.ownerId)
                    const matches = numericOwnerId === ownerId
                    console.log('Property', item.id, 'ownerId:', numericOwnerId, 'matches:', matches)
                    return matches
                }
                // For properties without ownerId (legacy), return false
                console.log('Property', item.id, 'has no ownerId')
                return false
            })

            console.log('Filtered properties count:', filteredItems.length)
            console.log(
                'Filtered properties:',
                filteredItems.map((item) => ({ id: item.id, ownerId: item.ownerId, title: item.title }))
            )

            return filteredItems.map((item) => this.convertPropertyFromDynamoDB(item)).sort((a, b) => b.id - a.id)
        })
    }

    async togglePropertyAvailability(id: number): Promise<Property | undefined> {
        return executeWithRetry(async () => {
            const property = await this.getProperty(id)
            if (!property) {
                return undefined
            }
            const updatedItem = await DynamoDBUtils.updateItem(
                TABLES.PROPERTIES,
                { id: toStringId(id) },
                'SET #isAvailable = :isAvailable, #updatedAt = :updatedAt',
                { ':isAvailable': !property.isAvailable, ':updatedAt': generateTimestamp() },
                { '#isAvailable': 'isAvailable', '#updatedAt': 'updatedAt' }
            )
            return updatedItem ? this.convertPropertyFromDynamoDB(updatedItem) : undefined
        })
    }

    // Amenity methods
    async getAllAmenities(): Promise<Amenity[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(TABLES.AMENITIES)
            return items.map((item) => this.convertAmenityFromDynamoDB(item))
        })
    }

    async getAmenity(id: number): Promise<Amenity | undefined> {
        return executeWithRetry(async () => {
            const item = await DynamoDBUtils.getItem(TABLES.AMENITIES, { id: toStringId(id) })
            return item ? this.convertAmenityFromDynamoDB(item) : undefined
        })
    }

    async createAmenity(insertAmenity: InsertAmenity): Promise<Amenity> {
        return executeWithRetry(async () => {
            const id = generateId()
            const timestamp = generateTimestamp()
            const amenity = {
                ...insertAmenity,
                id: toStringId(id),
                createdAt: timestamp,
                updatedAt: timestamp,
            }

            await DynamoDBUtils.putItem(TABLES.AMENITIES, amenity)
            return this.convertAmenityFromDynamoDB(amenity)
        })
    }

    // Property type methods
    async getAllPropertyTypes(): Promise<PropertyType[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.scanTable(TABLES.PROPERTY_TYPES)
            return items.map((item) => this.convertPropertyTypeFromDynamoDB(item))
        })
    }

    async getPropertyType(id: number): Promise<PropertyType | undefined> {
        return executeWithRetry(async () => {
            const item = await DynamoDBUtils.getItem(TABLES.PROPERTY_TYPES, { id: toStringId(id) })
            return item ? this.convertPropertyTypeFromDynamoDB(item) : undefined
        })
    }

    async createPropertyType(insertPropertyType: InsertPropertyType): Promise<PropertyType> {
        return executeWithRetry(async () => {
            const id = generateId()
            const timestamp = generateTimestamp()
            const propertyType = {
                ...insertPropertyType,
                id: toStringId(id),
                createdAt: timestamp,
                updatedAt: timestamp,
            }

            await DynamoDBUtils.putItem(TABLES.PROPERTY_TYPES, propertyType)
            return this.convertPropertyTypeFromDynamoDB(propertyType)
        })
    }

    // Helper methods to convert DynamoDB items to application types
    private convertUserFromDynamoDB(item: any): User {
        return {
            ...item,
            id: toNumericId(item.id),
        }
    }

    private async convertPropertyFromDynamoDB(item: any): Promise<Property> {
        const property = {
            ...item,
            id: toNumericId(item.id),
            viewCount: item.viewCount || 0,
            ownerId: item.ownerId ? toNumericId(item.ownerId) : undefined,
        }

        // Ensure amenities is always an array
        if (property.amenities === undefined || property.amenities === null) {
            property.amenities = []
        } else if (typeof property.amenities === 'string') {
            try {
                const parsed = JSON.parse(property.amenities)
                property.amenities = Array.isArray(parsed) ? parsed : []
            } catch (e) {
                property.amenities = property.amenities.includes(',')
                    ? property.amenities.split(',').map((s: string) => s.trim())
                    : [property.amenities]
            }
        } else if (!Array.isArray(property.amenities)) {
            property.amenities = []
        }

        return property
    }

    private convertAmenityFromDynamoDB(item: any): Amenity {
        return {
            ...item,
            id: toNumericId(item.id),
        }
    }

    private convertPropertyTypeFromDynamoDB(item: any): PropertyType {
        return {
            ...item,
            id: toNumericId(item.id),
        }
    }

    async getUserViewedTours(userId: number): Promise<any[]> {
        return executeWithRetry(async () => {
            const items = await DynamoDBUtils.queryTable(
                TABLES.USER_TOURS,
                '#userId = :userId',
                { ':userId': toStringId(userId) },
                { '#userId': 'userId' }
            )
            return items
        })
    }

    async addUserViewedTour(userId: number, tourId: string, propertyId: string, price: number): Promise<any> {
        return executeWithRetry(async () => {
            const item = {
                userId: toStringId(userId),
                tourId,
                propertyId,
                price,
                viewedAt: generateTimestamp(),
            }
            await DynamoDBUtils.putItem(TABLES.USER_TOURS, item)
            return item
        })
    }

    async recordTourPayment(paymentData: {
        transactionId: string
        propertyId: number
        userId?: number
        amount: number
        currency: string
        timestamp: string
    }): Promise<void> {
        return executeWithRetry(async () => {
            const item = {
                id: generateId(),
                transactionId: paymentData.transactionId,
                propertyId: toStringId(paymentData.propertyId),
                userId: paymentData.userId ? toStringId(paymentData.userId) : null,
                amount: paymentData.amount,
                currency: paymentData.currency,
                timestamp: paymentData.timestamp,
                createdAt: generateTimestamp(),
            }
            await DynamoDBUtils.putItem(TABLES.TOUR_PAYMENTS, item)
        })
    }

    async getAllTourPayments(): Promise<
        Array<{
            id: number
            transactionId: string
            propertyId: number
            propertyTitle: string
            propertyLocation: string
            userId?: number
            userName?: string
            userEmail?: string
            amount: number
            currency: string
            paymentTimestamp: string
            createdAt: string
        }>
    > {
        return executeWithRetry(async () => {
            // Get all tour payments
            const payments = await DynamoDBUtils.scanTable(TABLES.TOUR_PAYMENTS)

            // Get all properties and users for enrichment
            const properties = await this.getAllProperties()
            const users = await this.getAllUsers()

            // Enrich payment data with property and user information
            const enrichedPayments = payments.map((payment: any) => {
                const property = properties.find((p) => p.id === toNumericId(payment.propertyId))
                const user = payment.userId ? users.find((u) => u.id === toNumericId(payment.userId)) : null

                return {
                    id: toNumericId(payment.id),
                    transactionId: payment.transactionId,
                    propertyId: toNumericId(payment.propertyId),
                    propertyTitle: property?.title || 'Unknown Property',
                    propertyLocation: property?.location || 'Unknown Location',
                    userId: payment.userId ? toNumericId(payment.userId) : undefined,
                    userName: user?.fullName || user?.username || 'Anonymous User',
                    userEmail: user?.email || 'No email',
                    amount: payment.amount,
                    currency: payment.currency,
                    paymentTimestamp: payment.timestamp,
                    createdAt: payment.createdAt,
                }
            })

            // Sort by most recent first
            return enrichedPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        })
    }

    async getAgentSubscriptions(): Promise<
        Array<{
            agentId: number
            agentName: string
            email: string
            companyName?: string
            phoneNumber?: string
            licenseNumber?: string
            subscriptionPlan: string
            subscriptionStatus: string
            membershipStartDate: string
            membershipEndDate: string
            subscriptionPaymentId?: string
            propertyCount: number
            totalViews: number
            isExpired: boolean
            daysUntilExpiry: number
        }>
    > {
        return executeWithRetry(async () => {
            // Get all users who are agents
            const users = await this.getAllUsers()
            const agents = users.filter((user) => user.role === 'agent')

            // Get all properties to calculate stats
            const properties = await this.getAllProperties()

            const agentSubscriptions = await Promise.all(
                agents.map(async (agent) => {
                    // Get agent's properties
                    const agentProperties = properties.filter((prop) => prop.ownerId === agent.id)
                    const propertyCount = agentProperties.length
                    const totalViews = agentProperties.reduce((sum, prop) => sum + (prop.viewCount || 0), 0)

                    // Calculate subscription status
                    const endDate = agent.membershipEndDate ? new Date(agent.membershipEndDate) : null
                    const now = new Date()
                    const isExpired = endDate ? endDate < now : true
                    const daysUntilExpiry = endDate
                        ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                        : 0

                    return {
                        agentId: agent.id,
                        agentName: agent.fullName,
                        email: agent.email,
                        companyName: agent.companyName || undefined,
                        phoneNumber: agent.phoneNumber || undefined,
                        licenseNumber: agent.licenseNumber || undefined,
                        subscriptionPlan: agent.membershipPlan || 'basic',
                        subscriptionStatus: agent.subscriptionStatus || 'inactive',
                        membershipStartDate: agent.membershipStartDate || '',
                        membershipEndDate: agent.membershipEndDate || '',
                        subscriptionPaymentId: agent.subscriptionPaymentId || undefined,
                        propertyCount,
                        totalViews,
                        isExpired,
                        daysUntilExpiry,
                    }
                })
            )

            // Sort by subscription status (active first, then by expiry date)
            return agentSubscriptions.sort((a, b) => {
                if (a.subscriptionStatus === 'active' && b.subscriptionStatus !== 'active') return -1
                if (b.subscriptionStatus === 'active' && a.subscriptionStatus !== 'active') return 1
                return a.daysUntilExpiry - b.daysUntilExpiry
            })
        })
    }

    async getAgentPropertiesForAdmin(agentId: number): Promise<
        Array<{
            propertyId: number
            title: string
            location: string
            price: number
            category: string
            viewCount: number
            createdAt: string
            isAvailable: boolean
        }>
    > {
        return executeWithRetry(async () => {
            const properties = await this.getPropertiesByOwner(agentId)

            return properties.map((prop) => ({
                propertyId: prop.id,
                title: prop.title,
                location: prop.location,
                price: prop.price,
                category: prop.category,
                viewCount: prop.viewCount || 0,
                createdAt: prop.createdAt || new Date().toISOString(),
                isAvailable: prop.isAvailable,
            }))
        })
    }

    // Video settings methods
    async getVideoSettings(): Promise<{ heroVideoUrl: string; lastUpdated?: string }> {
        return executeWithRetry(async () => {
            try {
                const item = await DynamoDBUtils.getItem(TABLES.SETTINGS, { id: 'video-settings' })
                if (item) {
                    return {
                        heroVideoUrl: item.heroVideoUrl || 'https://youtu.be/cgM6poO2JmY?t=9',
                        lastUpdated: item.lastUpdated,
                    }
                }
            } catch (error) {
                console.log('Video settings not found, returning default')
            }

            // Return default if not found
            return {
                heroVideoUrl: 'https://youtu.be/cgM6poO2JmY?t=9',
            }
        })
    }

    async saveVideoSettings(settings: {
        heroVideoUrl: string
        lastUpdated: string
    }): Promise<{ heroVideoUrl: string; lastUpdated: string }> {
        return executeWithRetry(async () => {
            const item = {
                id: 'video-settings',
                heroVideoUrl: settings.heroVideoUrl,
                lastUpdated: settings.lastUpdated,
            }

            await DynamoDBUtils.putItem(TABLES.SETTINGS, item)
            return settings
        })
    }
}
