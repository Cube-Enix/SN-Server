import express from "express";
import { Database } from "better-sqlite3";
import sha512 from "js-sha512";
import * as fs from "fs";
import * as crypto from "crypto";
import multer from "multer";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
const app = express();
const upload = multer({ storage: multer.diskStorage(
    { destination: (req, file, cb) => { cb(null, 'public/uploads') },
        filename: (req, file, cb) => { const uniqueSuffix = sha512(Date.now()) + '-' + Math.round(Math.random() * 1E9) + uuidv4(); cb(null, file.originalname + uniqueSuffix) } }
) })
app.use(express.json());
const VERSION = "1.0.0";
const db = new Database('snedit.db')
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

db.prepare('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, filedata TEXT, key TEXT, name TEXT, bio TEXT, icon TEXT, rating REAL, author TEXT, accesstokens TEXT, cost REAL)').run()
db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT, bio TEXT, avatar TEXT, ratings TEXT, scoins REAL, usertokens TEXT)').run()

app.get('/', (req, res) => {
    res.status(200).json({ version: VERSION, uptime: process.uptime() });
})

app.get('/projects', (req, res) => {
    let projects = db.prepare('SELECT * FROM projects').all()
    projects.forEach((obj, index) => {
        delete obj.key
        projects[index] = obj
    })
    res.status(200).json({ projects: projects, success: true })
})

app.get('/project/:id', (req, res) => {
    try {
        let project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
        delete project.key
        delete project.filedata
        delete project.accesstokens
        res.status(200).json({ project: project, success: true })
    } catch(e) {
        res.status(404).json({ project: null, success: false })
    }
})

app.get('/users', (req, res) => {
    let users = db.prepare('SELECT * FROM users').all()
    users.forEach((obj, index) => {
        delete obj.password
        delete obj.usertokens
        users[index] = obj
    })
    res.status(200).json({ users: users, success: true })
})

app.get('/user/:id', (req, res) => {
    try {
        let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
        delete user.password
        delete user.usertokens
        res.status(200).json({ user: user, success: true })
    } catch (e) {
        res.status(200).json({ user: null, success: false })
    }
})

app.post('/users', upload.single('avatar'), (req, res) => {
    if (!req.body.username || !req.body.password || !req.file['avatar'][0]) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
    if (user) {
        res.status(409).json({ res: 'User already exists', success: false });
    } else {
        db.prepare('INSERT INTO users (username, password, bio, avatar, ratings, scoins, usertokens) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.body.username, sha512(req.body.password), "", req.file['avatar'][0].filename, "[]", 0, "[]");
        res.status(201).json({ res: 'User created', success: true });
    }
})

app.post('/projects', upload.fields([{ name: "projectfile", maxCount: 1 }, { name: "icon", maxCount: 1 }]), (req, res) => {
    if (!req.file['projectfile'][0] || !req.file['icon'][0] || !req.body.name || !req.body.bio || !req.body.username || !req.body.password || !req.body.key || !req.body.cost) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const file = fs.readFileSync(req.file['projectfile'][0].path)
    const cipher = crypto.createCipheriv('aes-256-cbc', req.body.key, req.body.key)
    const encrypted = Buffer.concat([cipher.update(file), cipher.final()])
    fs.writeFileSync(req.file['projectfile'][0].path, encrypted)
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
    if (user) {
        if (user.password != sha512(req.body.password)) {
            res.status(401).json({ res: 'Wrong password', success: false });
            return;
        }
    } else {
        res.status(404).json({ res: 'User not found', success: false });
        return;
    }
    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(req.body.name);
    if (project) {
        res.status(409).json({ res: 'Project already exists', success: false });
    } else {
        db.prepare('INSERT INTO projects (filedata, key, name, bio, icon, rating, author, accesstokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(req.file['projectfile'][0].filename, req.body.key, req.body.name, req.body.bio, req.file['icon'][0].filename, 3.5, req.body.username, "[]", req.body.cost);
        res.status(201).json({ res: 'Project created', success: true });
    }
})

app.put('/project/:id', upload.fields([{ name: "projectfile", maxCount: 1 }, { name: "icon", maxCount: 1 }]), (req, res) => {
    if (!req.file['projectfile'][0] || !req.file['icon'][0] || !req.body.name || !req.body.bio || !req.body.username || !req.body.password || !req.body.cost) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
    if (user) {
        if (user.password != sha512(req.body.password)) {
            res.status(401).json({ res: 'Wrong password', success: false });
            return;
        }
    } else {
        res.status(404).json({ res: 'User not found', success: false });
        return;
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (project) {
        if (project.author != req.body.username) {
            res.status(401).json({ res: 'You are not the author of this project', success: false });
            return;
        }
        db.prepare('UPDATE projects SET filedata = ?, name = ?, bio = ?, icon = ?, rating = ?, author = ?, cost = ?, WHERE id = ?').run(req.file['projectfile'][0].filename, req.body.name, req.body.bio, req.file['icon'][0].filename, 3.5, req.body.username, req.body.cost, req.params.id);
        res.status(201).json({ res: 'Project updated', success: true });
    } else {
        res.status(404).json({ res: 'Project not found', success: false });
    }
})

app.post('/rate/:id', (req, res) => {
    if (!req.body.username || !req.body.password || !req.body.rating) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
    if (user) {
        if (user.password != sha512(req.body.password)) {
            res.status(401).json({ res: 'Wrong password', success: false });
            return;
        }
    } else {
        res.status(404).json({ res: 'User not found', success: false });
        return;
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (project) {
        let rating = project.rating
        let ratings = JSON.parse(user.ratings)
        if (ratings.includes(req.params.id)) {
            res.status(409).json({ res: 'You already rated this project', success: false });
            return;
        }
        ratings.push(req.params.id)
        db.prepare('UPDATE users SET ratings = ? WHERE username = ?').run(JSON.stringify(ratings), req.body.username)
        db.prepare('UPDATE projects SET rating = ? WHERE id = ?').run((rating + req.body.rating) / 2, req.params.id)
        res.status(201).json({ res: 'Project rated', success: true });
    } else {
        res.status(404).json({ res: 'Project not found', success: false });
    }
})

app.get('/search', (req, res) => {
    if (!req.query.q) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const projects = db.prepare('SELECT * FROM projects WHERE name LIKE ?').all('%' + req.query.q + '%');
    res.status(200).json({ res: projects, success: true });
})

app.get('/buy/:id', (req, res) => {
    if (!req.query.username || !req.query.password) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.query.username);
    if (user) {
        if (user.password != sha512(req.query.password)) {
            res.status(401).json({ res: 'Wrong password', success: false });
            return;
        }
    } else {
        res.status(404).json({ res: 'User not found', success: false });
        return;
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (project) {
        if (project.cost > user.scoins) {
            res.status(401).json({ res: 'You do not have enough SCoins', success: false });
            return;
        }
        let accesstokens = JSON.parse(user.usertokens)
        let projecttokens = JSON.parse(project.accesstokens)
        let token = uuidv4()
        accesstokens.push(token)
        projecttokens.push(token)
        db.prepare('UPDATE users SET usertokens = ? WHERE username = ?').run(JSON.stringify(accesstokens), req.query.username)
        db.prepare('UPDATE projects SET accesstokens = ? WHERE id = ?').run(JSON.stringify(projecttokens), req.params.id)
        db.prepare('UPDATE users SET scoins = ? WHERE username = ?').run(user.scoins - project.cost, req.query.username)
        res.status(201).json({ res: 'Project bought', success: true });
    } else {
        res.status(404).json({ res: 'Project not found', success: false });
    }
})

app.get('/download/:id', (req, res) => {
    if (!req.query.username || !req.query.password) {
        res.status(400).json({ res: 'Missing parameters', success: false })
        return;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.query.username);
    if (user) {
        if (user.password != sha512(req.query.password)) {
            res.status(401).json({ res: 'Wrong password', success: false });
            return;
        }
    } else {
        res.status(404).json({ res: 'User not found', success: false });
        return;
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (project) {
        let accesstokens = JSON.parse(user.usertokens)
        let projecttokens = JSON.parse(project.accesstokens)
        let found = false
        for (let i = 0; i < accesstokens.length; i++) {
            if (projecttokens.includes(accesstokens[i])) {
                found = true
                break
            }
        }
        if (found) {
            // decrypt file
            let file = fs.readFileSync(__dirname, '/uploads', project.filedata)
            const cypher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(project.key, 'hex'), Buffer.from(project.key, 'hex'));
            let decrypted = cypher.update(file);
            decrypted = Buffer.concat([decrypted, cypher.final()]);
            res.status(200).json({ res: decrypted, success: true });
        } else {
            res.status(401).json({ res: 'Unauthorized', success: false });
        }
    } else {
        res.status(404).json({ res: 'Project not found', success: false });
    }
})

app.listen(3000, () => {
    console.log('Server started on port 3000');
})