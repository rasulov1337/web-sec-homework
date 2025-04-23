import express from "express";
import { getAllRequests, getRequestById } from "./storage.js";
import { scanRequestForHiddenParams } from "./proxy.js";

const app = express();

app.get("/requests", (req, res) => {
    res.json(getAllRequests());
});

app.get("/requests/:id", (req, res) => {
    const data = getRequestById(req.params.id);
    if (!data) return res.status(404).send("Not found");
    res.json(data);
});

app.get("/repeat/:id", async (req, res) => {
    const data = getRequestById(req.params.id);
    if (!data) return res.status(404).json({ error: "Not found" });

    const headers = JSON.parse(data.headers);
    const postParams = JSON.parse(data.post_params);
    let body = "";

    if (postParams) {
        body = new URLSearchParams(postParams).toString();
        headers["content-length"] = Buffer.byteLength(body);
    }

    const options = {
        hostname: headers.host,
        port: 80,
        path: data.path,
        method: data.method,
        headers,
    };

    const proxyReq = request(options, (proxyRes) => {
        proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
        res.status(500).send("Repeat Error");
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
});

app.get("/scan/:requestId", async (req, res) => {
    const result = await scanRequestForHiddenParams(req.params.requestId);
    res.json(result);
});

export default app;
