import { users, properties, amenities, propertyTypes } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or } from "drizzle-orm";
export class DatabaseStorage {
    // User methods
    async getUser(id) {
        const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return result[0];
    }
    async getUserByUsername(username) {
        const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
        return result[0];
    }
    async getAllUsers() {
        return await db.select().from(users);
    }
    async createUser(insertUser) {
        const result = await db.insert(users).values(insertUser).returning();
        return result[0];
    }
    async updateUser(userId, userUpdate) {
        const result = await db.update(users)
            .set(userUpdate)
            .where(eq(users.id, userId))
            .returning();
        if (result.length === 0) {
            throw new Error(`User with ID ${userId} not found`);
        }
        return result[0];
    }
    async updateUserRole(userId, role) {
        const result = await db.update(users)
            .set({ role })
            .where(eq(users.id, userId))
            .returning();
        if (result.length === 0) {
            throw new Error(`User with ID ${userId} not found`);
        }
        return result[0];
    }
    // Helper method to ensure amenities is always an array
    ensureAmenitiesArray(property) {
        try {
            if (property && property.amenities !== undefined && property.amenities !== null) {
                // If amenities is already an array, keep it as is
                if (Array.isArray(property.amenities)) {
                    return property;
                }
                // If amenities is a string, try to parse it as JSON
                if (typeof property.amenities === 'string') {
                    try {
                        const parsed = JSON.parse(property.amenities);
                        property.amenities = Array.isArray(parsed) ? parsed : [];
                    }
                    catch (e) {
                        // If parsing fails, split by comma or set to empty array
                        property.amenities = property.amenities.includes(',')
                            ? property.amenities.split(',').map((s) => s.trim())
                            : [property.amenities];
                    }
                }
                else {
                    // If it's neither array nor string, set to empty array
                    property.amenities = [];
                }
            }
            else {
                // If amenities is undefined or null, set to empty array
                property.amenities = [];
            }
        }
        catch (error) {
            // If any error occurs, set amenities to empty array
            console.warn('Error processing amenities for property:', property?.id, error);
            property.amenities = [];
        }
        return property;
    }
    // Property methods
    async getAllProperties() {
        try {
            const results = await db.select().from(properties).orderBy(desc(properties.id));
            console.log('Raw database results:', results.length, 'properties');
            return results.map(property => this.ensureAmenitiesArray(property));
        }
        catch (error) {
            console.error('Error in getAllProperties:', error);
            throw error;
        }
    }
    async getProperty(id) {
        const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
        return result[0] ? this.ensureAmenitiesArray(result[0]) : undefined;
    }
    async getFeaturedProperties() {
        try {
            const results = await db.select()
                .from(properties)
                .where(eq(properties.isFeatured, true))
                .orderBy(desc(properties.id))
                .limit(4);
            console.log('Featured properties from DB:', results.length);
            return results.map(property => this.ensureAmenitiesArray(property));
        }
        catch (error) {
            console.error('Error in getFeaturedProperties:', error);
            throw error;
        }
    }
    async getPropertiesByCategory(category) {
        const results = await db.select()
            .from(properties)
            .where(eq(properties.category, category))
            .orderBy(desc(properties.id));
        return results.map(property => this.ensureAmenitiesArray(property));
    }
    async searchProperties(query) {
        const searchPattern = `%${query}%`;
        const results = await db.select()
            .from(properties)
            .where(or(sql `${properties.title} ILIKE ${searchPattern}`, sql `${properties.location} ILIKE ${searchPattern}`, sql `${properties.propertyType} ILIKE ${searchPattern}`, sql `${properties.description} ILIKE ${searchPattern}`))
            .orderBy(desc(properties.id));
        return results.map(property => this.ensureAmenitiesArray(property));
    }
    async filterProperties(filters) {
        const conditions = [];
        // Handle specific filter cases
        if (filters.category) {
            conditions.push(eq(properties.category, filters.category));
        }
        if (filters.propertyType) {
            conditions.push(eq(properties.propertyType, filters.propertyType));
        }
        if (filters.bedrooms) {
            conditions.push(eq(properties.bedrooms, filters.bedrooms));
        }
        if (filters.bathrooms) {
            conditions.push(eq(properties.bathrooms, filters.bathrooms));
        }
        if (filters.isFeatured !== undefined && filters.isFeatured !== null) {
            conditions.push(eq(properties.isFeatured, filters.isFeatured));
        }
        if (filters.isAvailable !== undefined && filters.isAvailable !== null) {
            conditions.push(eq(properties.isAvailable, filters.isAvailable));
        }
        if (filters.amenities && Array.isArray(filters.amenities)) {
            // For amenities, check if all required amenities are present
            conditions.push(sql `${properties.amenities} @> ${JSON.stringify(filters.amenities)}`);
        }
        if (conditions.length === 0) {
            const results = await db.select().from(properties).orderBy(desc(properties.id));
            return results.map(property => this.ensureAmenitiesArray(property));
        }
        const results = await db.select()
            .from(properties)
            .where(and(...conditions))
            .orderBy(desc(properties.id));
        return results.map(property => this.ensureAmenitiesArray(property));
    }
    async createProperty(insertProperty) {
        const result = await db.insert(properties).values(insertProperty).returning();
        return this.ensureAmenitiesArray(result[0]);
    }
    async updateProperty(id, propertyUpdate) {
        const result = await db.update(properties)
            .set(propertyUpdate)
            .where(eq(properties.id, id))
            .returning();
        return result[0] ? this.ensureAmenitiesArray(result[0]) : undefined;
    }
    async deleteProperty(id) {
        const result = await db.delete(properties).where(eq(properties.id, id)).returning();
        return result.length > 0;
    }
    async incrementPropertyViewCount(id) {
        const result = await db.update(properties)
            .set({ viewCount: sql `${properties.viewCount} + 1` })
            .where(eq(properties.id, id))
            .returning();
        return result[0] ? this.ensureAmenitiesArray(result[0]) : undefined;
    }
    async getPopularProperties(limit = 4) {
        const results = await db.select()
            .from(properties)
            .orderBy(desc(properties.viewCount), desc(properties.id))
            .limit(limit);
        return results.map(property => this.ensureAmenitiesArray(property));
    }
    async getRecentlyAddedProperties(limit = 4) {
        const results = await db.select()
            .from(properties)
            .orderBy(desc(properties.id))
            .limit(limit);
        return results.map(property => this.ensureAmenitiesArray(property));
    }
    // Amenity methods
    async getAllAmenities() {
        return await db.select().from(amenities);
    }
    async getAmenity(id) {
        const result = await db.select().from(amenities).where(eq(amenities.id, id)).limit(1);
        return result[0];
    }
    async createAmenity(insertAmenity) {
        const result = await db.insert(amenities).values(insertAmenity).returning();
        return result[0];
    }
    // Property type methods
    async getAllPropertyTypes() {
        return await db.select().from(propertyTypes);
    }
    async getPropertyType(id) {
        const result = await db.select().from(propertyTypes).where(eq(propertyTypes.id, id)).limit(1);
        return result[0];
    }
    async createPropertyType(insertPropertyType) {
        const result = await db.insert(propertyTypes).values(insertPropertyType).returning();
        return result[0];
    }
}
// Use database storage for migration and production
export const storage = new DatabaseStorage();
// Temporarily use memory storage due to database connection issues
// TODO: Fix Neon database connection and switch back to DatabaseStorage
// export const storage = new MemStorage();
