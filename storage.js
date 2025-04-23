import Database from "better-sqlite3";

const db = new Database("db.sqlite");

db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT,
        path TEXT,
        get_params TEXT,
        headers TEXT,
        cookies TEXT,
        post_params TEXT,
        body TEXT,
        response_code INTEGER,
        response_headers TEXT,
        response_body TEXT,
        protocol TEXT
    );
    `);

export function saveRequest(data) {
    const statement = db.prepare(`
            INSERT INTO requests (
                method, path, get_params, headers, cookies,
                post_params, body, response_code, response_headers,
                response_body, protocol
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
    statement.run(
        data.method,
        data.path,
        JSON.stringify(data.get_params),
        JSON.stringify(data.headers),
        JSON.stringify(data.cookies),
        JSON.stringify(data.post_params),
        data.request_body,
        data.response_code,
        JSON.stringify(data.response_headers),
        data.response_body,
        data.protocol
    );
}

export function getRequestById(id) {
    return db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
}

export function getAllRequests() {
    return db
        .prepare(
            "SELECT id, method, path, headers FROM requests ORDER BY id DESC"
        )
        .all();
}
