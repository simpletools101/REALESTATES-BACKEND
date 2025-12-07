import 'dotenv/config';
import ftp from 'basic-ftp';

async function testFtpConnection() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false
        });
        console.log("Connected to FTP!");
        const list = await client.list('/tours');
        console.log("Files in /tours:", list.map(f => f.name));
    } catch (err) {
        console.error("FTP connection failed:", err);
    }
    client.close();
}

testFtpConnection();