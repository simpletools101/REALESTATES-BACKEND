import express, { type Request, Response, NextFunction } from 'express'
import { registerRoutes } from './routes'

import fs from 'fs'
import path from 'path'

// Create necessary directories for uploads
const uploadDir = path.join(process.cwd(), 'uploads')
const imageDir = path.join(uploadDir, 'images')
const tourDir = path.join(uploadDir, 'tours')

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir)
    // log("Created uploads directory"); // Removed log as per new_code
}
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir)
    // log("Created images directory"); // Removed log as per new_code
}
if (!fs.existsSync(tourDir)) {
    fs.mkdirSync(tourDir)
    // log("Created tours directory"); // Removed log as per new_code
}

const app = express()
app.use(express.json({ limit: '5gb' }))
app.use(express.urlencoded({ extended: true, limit: '5gb' }))

// Add CORS headers
app.use((req, res, next) => {
    // Allow credentials and set specific origin instead of wildcard
    const origin = req.headers.origin
    if (origin) {
        res.header('Access-Control-Allow-Origin', origin)
    }
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end()
    }

    next()
})

app.use((req, res, next) => {
    const start = Date.now()
    const path = req.path
    let capturedJsonResponse: Record<string, any> | undefined = undefined

    const originalResJson = res.json
    res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson
        return originalResJson.apply(res, [bodyJson, ...args])
    }

    res.on('finish', () => {
        const duration = Date.now() - start
        if (path.startsWith('/api')) {
            let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`
            if (capturedJsonResponse) {
                logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`
            }

            if (logLine.length > 80) {
                logLine = logLine.slice(0, 79) + '…'
            }

            // log(logLine); // Removed log as per new_code
        }
    })

    next()
})

;(async () => {
    const server = await registerRoutes(app)

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500
        const message = err.message || 'Internal Server Error'

        res.status(status).json({ message })
        throw err
    })


    /**
     * This is the removed file of the web app of the client process that was attaching itself
     */

    // if (app.get('env') === 'development') {
    //     const { setupVite, log } = await import('./viteDevServer')
    //     await setupVite(app, server)
    // } else {
    //     const { serveStatic } = await import('./vite')
    //     serveStatic(app)
    // }

    // Use the PORT environment variable provided by the cloud platform
    // with a fallback to port 5001 for local development (changed from 5000 to avoid conflicts)
    // In your server/index.ts file
    try {
        const port = process.env.PORT || 5001
        app.listen(Number(port), '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${port}`)
        })
    } catch (error) {
        console.error('Failed to start server:', error)
        // Log more details about the error
        console.error(JSON.stringify(error, null, 2))
    }
})()
