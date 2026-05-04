require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const User = require('./models/User');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const likeRoutes = require('./routes/likeRoutes');
const matchRoutes = require('./routes/matchRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reportRoutes = require('./routes/reportRoutes');
const metaRoutes = require('./routes/metaRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const premiumRoutes = require('./routes/premiumRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { seedDefaultAdmin, setSocketIo } = require('./utils/appHelpers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

setSocketIo(io);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';

let databaseReady = false;
let databaseErrorMessage = '';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Dating App API is running.' });
});

app.get('/api/health', (req, res) => {
  if (databaseReady) {
    return res.json({ ok: true, databaseReady: true, port: PORT });
  }

  return res.status(503).json({
    ok: false,
    databaseReady: false,
    port: PORT,
    message: databaseErrorMessage || 'Backend server is running, but MongoDB is not connected.'
  });
});

app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/') {
    return next();
  }

  if (!databaseReady && req.path.startsWith('/api/')) {
    return res.status(503).json({
      message: 'Backend server is running, but MongoDB is not connected. Start MongoDB or update MONGO_URI in backend/.env.'
    });
  }

  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/likes', likeRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dating-app-secret');
    const user = await User.findById(payload.id).lean();
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    return next();
  } catch (error) {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user._id.toString()}`);
  socket.on('disconnect', () => {});
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/datingApp')
  .then(async () => {
    databaseReady = true;
    databaseErrorMessage = '';
    await seedDefaultAdmin();
    console.log('MongoDB connected successfully.');
  })
  .catch((error) => {
    databaseReady = false;
    databaseErrorMessage = error.message;
    console.error('MongoDB connection failed:', error);
    console.error('Backend API is still running, but signup/login will stay unavailable until MongoDB starts.');
  });
