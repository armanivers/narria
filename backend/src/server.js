const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { getStoryPageImage } = require("./services/imageService");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const dataPath = (...parts) => path.join(__dirname, "..", "data", ...parts);

function readJson(fileName) {
  const file = dataPath(fileName);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(fileName, value) {
  const file = dataPath(fileName);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = readJson("users.json");
  const match = users.find(
    (user) => user.username === username && user.password === password
  );

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  return res.json({
    token: `fake-jwt-${match.id}`,
    parent: {
      id: match.id,
      username: match.username
    }
  });
});

app.post("/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const users = readJson("users.json");
  const existing = users.find((user) => user.username === username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists" });
  }

  const newUser = {
    id: `parent-${Date.now()}`,
    username,
    password
  };
  users.push(newUser);
  writeJson("users.json", users);

  return res.status(201).json({
    token: `fake-jwt-${newUser.id}`,
    parent: {
      id: newUser.id,
      username: newUser.username
    }
  });
});

app.get("/profile/child/:parentId", (req, res) => {
  const { parentId } = req.params;
  const children = readJson("children.json");
  const child = children.find((item) => item.parentId === parentId);
  res.json({ child: child || null });
});

app.post("/profile/child", (req, res) => {
  const { parentId, childName, age } = req.body || {};
  if (!parentId || !childName) {
    return res.status(400).json({ error: "parentId and childName are required" });
  }

  const children = readJson("children.json");
  const existingIndex = children.findIndex((item) => item.parentId === parentId);
  const child = {
    id: `child-${Date.now()}`,
    parentId,
    childName,
    age: age || null
  };

  if (existingIndex >= 0) {
    children[existingIndex] = child;
  } else {
    children.push(child);
  }
  writeJson("children.json", children);

  return res.status(201).json({ child });
});

app.get("/books", (_req, res) => {
  const books = readJson("books.json");
  res.json({ books });
});

app.get("/books/:bookId", (req, res) => {
  const books = readJson("books.json");
  const book = books.find((item) => item.id === req.params.bookId);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  return res.json({ book });
});

app.get("/books/:bookId/pages/:pageNumber", (req, res) => {
  const books = readJson("books.json");
  const book = books.find((item) => item.id === req.params.bookId);
  const pageNumber = Number(req.params.pageNumber);

  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > book.pages) {
    return res.status(400).json({ error: "Page out of range" });
  }

  const imagePayload = getStoryPageImage({ book, pageNumber });
  return res.json({
    bookId: book.id,
    pageNumber,
    totalPages: book.pages,
    image: imagePayload
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
