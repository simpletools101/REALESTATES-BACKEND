import {
  users, type User, type InsertUser,
  properties, type Property, type InsertProperty,
  amenities, type Amenity, type InsertAmenity,
  propertyTypes, type PropertyType, type InsertPropertyType
} from "@shared/schema";
import { DynamoDBStorage } from "./dynamodb-storage";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(userId: number, userUpdate: Partial<User>): Promise<User>;
  updateUserRole(userId: number, role: string): Promise<User>;
  verifyUser(userId: number): Promise<User>;
  updateVerificationToken(userId: number, token: string, expiry: string): Promise<User>;

  // Property methods
  getAllProperties(): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  getFeaturedProperties(): Promise<Property[]>;
  getPropertiesByCategory(category: string): Promise<Property[]>;
  searchProperties(query: string): Promise<Property[]>;
  filterProperties(filters: Partial<Property>): Promise<Property[]>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, property: Partial<Property>): Promise<Property | undefined>;
  deleteProperty(id: number): Promise<boolean>;
  incrementPropertyViewCount(id: number): Promise<Property | undefined>;
  togglePropertyAvailability(id: number): Promise<Property | undefined>;
  getPopularProperties(limit?: number): Promise<Property[]>;
  getRecentlyAddedProperties(limit?: number): Promise<Property[]>;
  getPropertiesByOwner(ownerId: number): Promise<Property[]>;
  getUserViewedTours(userId: number): Promise<any[]>;
  addUserViewedTour(userId: number, tourId: string, propertyId: string, price: number): Promise<any>;
  recordTourPayment(paymentData: {
    transactionId: string;
    propertyId: number;
    userId?: number;
    amount: number;
    currency: string;
    timestamp: string;
  }): Promise<void>;
  getAllTourPayments(): Promise<Array<{
    id: number;
    transactionId: string;
    propertyId: number;
    propertyTitle: string;
    propertyLocation: string;
    userId?: number;
    userName?: string;
    userEmail?: string;
    amount: number;
    currency: string;
    paymentTimestamp: string;
    createdAt: string;
  }>>;

  // Analytics methods
  trackDetailedPropertyView(viewData: {
    propertyId: number;
    userId?: number | null;
    userAgent?: string;
    referrer?: string;
    ipAddress?: string;
    timestamp: string;
  }): Promise<void>;
  getPropertyViewAnalytics(propertyId: number): Promise<{
    totalViews: number;
    uniqueViews: number;
    viewsByDate: Array<{ date: string; count: number }>;
    viewsByHour: Array<{ hour: number; count: number }>;
    topReferrers: Array<{ referrer: string; count: number }>;
    recentViews: Array<{ timestamp: string; userAgent?: string; ipAddress?: string }>;
  }>;
  getAgentAnalytics(agentId: number): Promise<{
    totalProperties: number;
    totalViews: number;
    averageViewsPerProperty: number;
    topPerformingProperty: Property | null;
    viewsThisMonth: number;
    viewsLastMonth: number;
    growthRate: number;
    propertiesByCategory: Array<{ category: string; count: number }>;
  }>;
  getAdminAnalytics(): Promise<{
    totalProperties: number;
    totalUsers: number;
    totalViews: number;
    topAgents: Array<{ agentId: number; agentName: string; propertyCount: number; totalViews: number }>;
    topProperties: Array<{ propertyId: number; title: string; viewCount: number; ownerName: string }>;
    viewsByCategory: Array<{ category: string; count: number }>;
    recentActivity: Array<{ type: string; description: string; timestamp: string }>;
  }>;

  // Amenity methods
  getAllAmenities(): Promise<Amenity[]>;
  getAmenity(id: number): Promise<Amenity | undefined>;
  createAmenity(amenity: InsertAmenity): Promise<Amenity>;

  // Property type methods
  getAllPropertyTypes(): Promise<PropertyType[]>;
  getPropertyType(id: number): Promise<PropertyType | undefined>;
  createPropertyType(propertyType: InsertPropertyType): Promise<PropertyType>;

  // Video settings methods
  getVideoSettings(): Promise<{ heroVideoUrl: string; lastUpdated?: string }>;
  saveVideoSettings(settings: { heroVideoUrl: string; lastUpdated: string }): Promise<{ heroVideoUrl: string; lastUpdated: string }>;
}


// Use DynamoDBStorage for all endpoints
export const storage = new DynamoDBStorage();
