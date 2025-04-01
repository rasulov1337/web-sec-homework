const http = require("http");

const PROXY_PORT = 8080;

const server = http.createServer((req, res) => {
  const { method, headers } = req;

  const match = req.url.match(/^http:\/\/([^\/]+)(.*)$/);
  if (!match) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request\n");
    return;
  }

  let [targetHost, targetPort] = match[1].split(":");
  targetPort = targetPort || 80;
  const relativePath = match[2] || "/";

  const filteredHeaders = { ...headers };
  delete filteredHeaders["proxy-connection"];
  delete filteredHeaders["Proxy-Connection"];
  filteredHeaders["host"] = targetHost;

  const options = {
    hostname: targetHost,
    port: targetPort,
    path: relativePath,
    method: method,
    headers: filteredHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // console.log("Response Headers:", proxyRes.headers);
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Proxy Error\n");
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
  console.log(`Proxy server running on port ${PROXY_PORT}`);
});
