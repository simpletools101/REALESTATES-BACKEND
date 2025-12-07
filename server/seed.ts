import { config } from "dotenv";
import path from "path";

// Load environment variables from the root directory
config({ path: path.resolve(process.cwd(), '.env') });

import { db } from "./db";
import { users, properties, amenities, propertyTypes } from "@shared/schema";
import type { InsertUser, InsertProperty, InsertAmenity, InsertPropertyType } from "@shared/schema";

async function seedDatabase() {
  console.log("🌱 Starting database seeding...");

  try {
    // Check if data already exists
    const existingUsers = await db.select().from(users).limit(1);
    const existingProperties = await db.select().from(properties).limit(1);

    if (existingUsers.length > 0 && existingProperties.length > 0) {
      console.log("✅ Database already has data, skipping seed");
      return;
    }

    if (existingUsers.length > 0) {
      console.log("👥 Users already exist, skipping user seeding");
    }

    if (existingProperties.length > 0) {
      console.log("🏘️ Properties already exist, skipping property seeding");
    }

    // Seed Users (only if they don't exist)
    if (existingUsers.length === 0) {
      console.log("👥 Seeding users...");
      const userData: InsertUser[] = [
      {
        username: "admin",
        password: "admin123",
        email: "admin@realevr.com",
        fullName: "Admin User",
        membershipPlan: "premium",
        membershipStartDate: null,
        membershipEndDate: null,
        role: "admin",
        isVerified: true
      },
      {
        username: "user",
        password: "admin123",
        email: "user@example.com",
        fullName: "Regular User",
        membershipPlan: "basic",
        membershipStartDate: null,
        membershipEndDate: null,
        role: "normal",
        isVerified: true
      },
      {
        username: "agent",
        password: "admin123",
        email: "agent@realevr.com",
        fullName: "Property Agent",
        membershipPlan: "premium",
        membershipStartDate: null,
        membershipEndDate: null,
        role: "agent",
        isVerified: true
      }
    ];

      await db.insert(users).values(userData);
      console.log(`✅ Seeded ${userData.length} users`);
    }

    // Seed Property Types
    console.log("🏠 Seeding property types...");
    const propertyTypeData: InsertPropertyType[] = [
      { name: "Apartments", icon: "building" },
      { name: "Houses", icon: "home" },
      { name: "Luxury", icon: "hotel" },
      { name: "Urban", icon: "city" },
      { name: "Beachfront", icon: "water" },
      { name: "Mountain", icon: "mountain" },
      { name: "Modern", icon: "building" }
    ];

    await db.insert(propertyTypes).values(propertyTypeData);
    console.log(`✅ Seeded ${propertyTypeData.length} property types`);

    // Seed Amenities
    console.log("🏊 Seeding amenities...");
    const amenityData: InsertAmenity[] = [
      { name: "Pool Access", icon: "swimming-pool", description: "Properties with swimming pools" },
      { name: "Fitness Center", icon: "dumbbell", description: "On-site gyms & fitness facilities" },
      { name: "Parking", icon: "parking", description: "Properties with parking spaces" },
      { name: "Pet Friendly", icon: "paw", description: "Accommodating for your pets" },
      { name: "High-Speed Internet", icon: "wifi", description: "Fast & reliable connectivity" }
    ];

    await db.insert(amenities).values(amenityData);
    console.log(`✅ Seeded ${amenityData.length} amenities`);

    // Seed Properties (first batch) - only if they don't exist
    if (existingProperties.length === 0) {
      console.log("🏘️ Seeding properties...");
      const propertyData1: InsertProperty[] = [
      {
        title: "La Rose Royal Apartments",
        location: "Nakasero, Kampala, Uganda",
        price: 1500,
        currency: "USD",
        description: "Experience luxury living at La Rose Royal Apartments in the heart of Nakasero. This elegant property offers spacious interiors, high-end finishes, and breathtaking views of Kampala.",
        bedrooms: 3,
        bathrooms: 2,
        squareMeters: 172,
        imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.97",
        reviewCount: 243,
        propertyType: "Luxury",
        category: "rental",
        isFeatured: true,
        hasTour: true,
        tourUrl: "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/",
        amenities: ["Pool Access", "Fitness Center", "24/7 Security", "Underground parking"],
        monthlyPrice: 1500
      },
      {
        title: "Kololo Heights Loft",
        location: "Kololo, Kampala, Uganda",
        price: 1200,
        description: "Modern loft with open floor plan and stunning views of the Kololo district, close to diplomatic missions and upscale amenities.",
        bedrooms: 2,
        bathrooms: 2,
        squareMeters: 112,
        imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.9",
        reviewCount: 156,
        propertyType: "Apartments",
        category: "furnished_houses",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Fitness Center", "High-Speed Internet", "Backup Power", "Rooftop Terrace"]
      },
      {
        title: "Lake Victoria Skies",
        location: "Munyonyo, Kampala, Uganda",
        price: 3800,
        description: "Luxurious penthouse with panoramic views of Lake Victoria and the stunning Kampala skyline. Located in the exclusive Munyonyo district.",
        bedrooms: 3,
        bathrooms: 3,
        squareMeters: 172,
        imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.7",
        reviewCount: 92,
        propertyType: "Luxury",
        category: "for_sale",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Pool Access", "Fitness Center", "Concierge", "Lake View", "24/7 Security"]
      }
    ];

      await db.insert(properties).values(propertyData1);
      console.log(`✅ Seeded ${propertyData1.length} properties (batch 1)`);
    }

    console.log("🎉 Database seeding completed successfully!");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run the seed function
seedDatabase()
  .then(() => {
    console.log("✅ Seeding completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  });

export { seedDatabase };
