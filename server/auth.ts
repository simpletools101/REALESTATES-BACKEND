import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmail, generateVerificationEmailHTML, generateVerificationEmailText } from "./email-service";


declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    // Check if the stored password has the expected format (with salt)
    if (!stored.includes('.')) {
      // For testing purposes: if password is stored as plain text "admin123"
      return supplied === stored;
    }

    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Password comparison error:", error);
    // Fallback for testing - if we're dealing with test accounts
    if (supplied === "admin123" && stored === "admin123") {
      return true;
    }
    return false;
  }
}

// Email verification helper functions
function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

function generateVerificationExpiry(): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 24); // 24 hours from now
  return expiry.toISOString();
}

async function sendVerificationEmail(email: string, fullName: string, token: string): Promise<boolean> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const verificationUrl = `${baseUrl}/api/verify-email?token=${token}`;

  const emailOptions = {
    to: email,
    subject: 'Verify Your Email - RealEVR Estates',
    html: generateVerificationEmailHTML(verificationUrl, fullName, token),
    text: generateVerificationEmailText(verificationUrl, fullName, token),
  };

  return await sendEmail(emailOptions);
}

export function setupAuth(app: Express) {
  // Use a default secret for offline development, but warn about it
  const sessionSecret = process.env.SESSION_SECRET || "realevr-dev-secret-key-for-offline-use-only";

  if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: Using insecure default SESSION_SECRET. Do not use in production!");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Always false for local dev (set to true only for HTTPS in production)
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: "lax",
      httpOnly: true,
      path: "/"
    },
    name: "session"
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // console.log("=== PASSPORT AUTHENTICATION ===");
        // console.log("Attempting login for username:", username);
        // console.log("Password provided:", password ? "***" : "NO PASSWORD");

        const user = await storage.getUserByUsername(username);
        // console.log("User found:", user ? `${user.username} (ID: ${user.id})` : "NO USER FOUND");
        if (user) {
          // console.log("User details:", { id: user.id, username: user.username, email: user.email, role: user.role });
        }

        if (!user) {
          console.log("Authentication failed: User not found");
          return done(null, false);
        }

        // console.log("Stored password:", user.password ? "***" : "NO PASSWORD");
        const passwordMatch = await comparePasswords(password, user.password);
        // console.log("Password match:", passwordMatch);

        if (!passwordMatch) {
          console.log("Authentication failed: Password mismatch");
          return done(null, false);
        } else {
          // console.log("Authentication successful for user:", user.username);
          return done(null, user);
        }
      } catch (error) {
        console.error("Authentication error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user: any, done) => {
    // console.log("SERIALIZE USER: User ID being serialized:", user.id, "(Type:", typeof user.id + ")");
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    // console.log("DESERIALIZE USER: ID received for deserialization:", id, "(Type:", typeof id + ")");
    try {
      const userId = parseInt(id, 10);
      if (isNaN(userId)) {
        console.error("Deserialization error: Invalid user ID provided:", id);
        return done(new Error("Invalid user ID"));
      }
      const user = await storage.getUser(userId);
      if (!user) {
        console.warn("Deserialization warning: User not found for ID:", userId);
        return done(null, false); // User not found
      }
      // console.log("DESERIALIZE USER: User found:", user.username, "(ID:", user.id + ")");
      done(null, user);
    } catch (error) {
      console.error("Deserialization error for user ID:", id, error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const existingEmailUser = await storage.getUserByEmail(req.body.email);
      if (existingEmailUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const verificationExpiry = generateVerificationExpiry();

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
        membershipPlan: req.body.membershipPlan || null,
        role: req.body.role || "normal",
        isVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpiry,
      });

      // Send verification email
      const emailSent = await sendVerificationEmail(user.email, user.fullName, verificationToken);

      if (!emailSent) {
        console.warn("Failed to send verification email to:", user.email);
        // If email fails, we could optionally still allow the user to register
        // but they'll need to use the resend verification feature
      }

      console.log("REGISTER ENDPOINT: User created with verification token:", user.id);

      // Return success message without user data (don't auto-login)
      res.status(201).json({
        success: true,
        message: "Registration successful! Please check your email to verify your account before logging in.",
        emailSent,
        requiresVerification: true
      });
    } catch (error) {
      next(error);
    }
  });

  // Email verification endpoint (for email links)
  app.get("/api/verify-email", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: "Invalid verification token" });
      }

      const user = await storage.getUserByVerificationToken(token);

      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      // Check if token has expired
      const now = new Date();
      const expiry = new Date(user.emailVerificationExpires!);

      if (now > expiry) {
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Update user as verified
      await storage.verifyUser(user.id);

      // Redirect to login page after successful verification
      res.redirect('/auth?verified=true');
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Token verification endpoint (for manual token input)
  app.post("/api/verify-token", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const user = await storage.getUserByVerificationToken(token);

      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      // Check if token has expired
      const now = new Date();
      const expiry = new Date(user.emailVerificationExpires!);

      if (now > expiry) {
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Update user as verified and log them in
      await storage.verifyUser(user.id);

      // Auto-login the verified user
      req.login(user, (err) => {
        if (err) {
          console.error("Auto-login error after verification:", err);
          return res.status(500).json({ error: "Failed to log in after verification" });
        }

        // Return user data (they're now logged in)
        const { password, emailVerificationToken, ...userWithoutPassword } = user;
        res.json({
          success: true,
          message: "Email verified successfully! Welcome to RealEVR Estates.",
          user: userWithoutPassword
        });
      });
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);

      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      if (user.isVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      // Generate new verification token
      const verificationToken = generateVerificationToken();
      const verificationExpiry = generateVerificationExpiry();

      // Update user with new token
      await storage.updateVerificationToken(user.id, verificationToken, verificationExpiry);

      // Send verification email
      const emailSent = await sendVerificationEmail(user.email, user.fullName, verificationToken);

      if (emailSent) {
        res.json({ message: "Verification email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send verification email" });
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    // console.log("=== LOGIN ENDPOINT HIT ===");
    // console.log("Request body:", req.body);
    // console.log("Content-Type:", req.headers['content-type']);

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Passport authentication error:", err);
        return next(err);
      }
      if (!user) {
        console.log("Authentication failed:", info);
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return next(err);
        }

        // Manually save the session to ensure it's persisted
        req.session.save((err: any) => {
          if (err) {
            console.error("Session save error:", err);
          } else {
            // console.log("Session saved successfully");
            // console.log("Session after save:", req.session);
            // console.log("Passport session after save:", (req.session as any)?.passport);
          }
        });

        // Return user without password
        const { password, ...userWithoutPassword } = req.user as SelectUser;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    // console.log("=== GET /api/user REQUEST ===");
    // console.log("Request origin:", req.headers.origin);
    // console.log("Request host:", req.headers.host);
    // console.log("Cookies:", req.headers.cookie);
    // console.log("Session ID:", req.sessionID);
    // console.log("Session data:", req.session);
    // console.log("Is authenticated:", req.isAuthenticated());
    // console.log("User:", req.user?.username);
    // console.log("Passport session:", (req.session as any)?.passport);

    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    // Return user without password
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });
}