'use strict';

// Load environment variables
require('dotenv').config();

const optionDefinitions = [
    { name: 'elastic_uri', alias: 'e', type: String, defaultValue: process.env.ELASTIC_URI }, // id field to use for file names in the dataset
    { name: 'keywordList', alias: 'k', type: String }, // id field to use for file names in the dataset
    { name: 'elastic_index', alias: 'i', type: String, defaultValue: process.env.ELASTIC_INDEX || "ojosanciones" } // elastic index name to query
];

const commandLineArgs = require('command-line-args');
const args = commandLineArgs(optionDefinitions);

//import user and keyword list
// const keywordList = require(args.keywordList)
const http = require("http");

const db = require("./lib/db");
const views = require("./lib/views");


const host = 'localhost';
const port = process.env.OJOSANCIONES_PORT || 8009;


const log = ""

main();


//Connect to elastic, query each keyword and send emails
function main() {
    db.connect(args.elastic_uri,args).then(() => {
        startServer();
    }).catch(err => {
        console.error(new Date(), "main error", "Error connecting to database", err.message);
        console.log(new Date(), "Database connection failed. Scheduling restart in 1 minute...");
        setTimeout(() => {
            console.log(new Date(), "Restarting process due to database connection failure...");
            process.exit(1);
        }, 60000); // 60000ms = 1 minute
        startServer();
    })
}

function startServer() {
    const server = http.createServer(views.requestListener);
    
    // Start server immediately
    server.listen(port, host, () => {
        console.log(new Date(), `startServer: Server is running on http://${host}:${port}`);
    });

    // Watch for file changes and restart server
    const chokidar = require('chokidar');
    const watcher = chokidar.watch('.', {
        ignored: (path, stats) => {
            let ignored = false;
            if (stats?.isFile()) {
                ignored = path.includes('static') || path.includes('node_modules') || path.includes('git') || path.includes('logs')
            }
            if (path.includes('headStyle.css')) {
                ignored = false;
            }
            return ignored;
        },
        awaitWriteFinish: true,
        atomic: true,
        persistent: true
    });

    console.log(new Date(), "startServer: Watching for file changes in", watcher.getWatched())

    watcher.on('change', (filePath) => {
        // Handle .pug template files by clearing template cache instead of restarting
        if (filePath.endsWith('.pug') || filePath.endsWith('.css')) {
            console.log(new Date(), `watcher: File ${filePath} has been changed. Pug template changed, clearing template cache...`);
            views.clearTemplateCache();
            return;
        }
        
        // For all other files, restart the server
        console.log(new Date(), `watcher: File ${filePath} has been changed. Non-template file changed, restarting server...`);
        if (process.env.pm_id) {
            console.log(new Date(), 'watcher: Running under PM2, skipping spawn');
            process.exit(0);
        }
        server.close(() => {
            console.log(new Date(), `watcher: File ${filePath} has been changed. Server closed`);
            const { spawn } = require('child_process');
            const child = spawn('node', ['ojosanciones-web-front.js', '--elastic_uri', args.elastic_uri, '--keywordList', args.keywordList, '--elastic_index', args.elastic_index], {
                detached: true,
                stdio: 'inherit',
                env: process.env
            });
            child.unref();
            process.exit(0); 
        });
    });
}

