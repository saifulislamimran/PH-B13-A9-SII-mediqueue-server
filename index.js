const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized access: Token missing' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: 'Forbidden access: Invalid or expired token' });
    }
    req.decoded = decoded;
    next();
  });
};

// MongoDB URI & Client Setup
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const db = client.db('mediQueue');
    const tutorsCollection = db.collection('tutors');
    const bookingsCollection = db.collection('bookings');
    
    // Auth related API (JWT)
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // Add a Tutor (Private Route)
    app.post('/tutors', verifyToken, async (req, res) => {
      const tutor = req.body;
      // Ensure numeric types for slot and price operations
      if (tutor.price !== undefined) tutor.price = Number(tutor.price);
      if (tutor.totalSlot !== undefined) tutor.totalSlot = Number(tutor.totalSlot);
      
      const result = await tutorsCollection.insertOne(tutor);
      res.send(result);
    });

    // Get Home Tutors (Limit to 6)
    app.get('/home-tutors', async (req, res) => {
      const result = await tutorsCollection.find().limit(6).toArray();
      res.send(result);
    });

    // Get all Tutors with search and date range filtering
    app.get('/tutors', async (req, res) => {
      try {
        const { search, startDate, endDate } = req.query;
        const query = {};

        // Case-insensitive name search using regex
        if (search) {
          query.name = { $regex: search, $options: 'i' };
        }

        // Date range filtering using $gte and $lte
        if (startDate || endDate) {
          query.sessionDate = {};
          if (startDate) {
            query.sessionDate.$gte = startDate;
          }
          if (endDate) {
            query.sessionDate.$lte = endDate;
          }
        }

        const result = await tutorsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Create a Booking (Private Route)
    app.post('/bookings', verifyToken, async (req, res) => {
      try {
        const { tutorId, userEmail, tutorEmail, price, sessionDate } = req.body;

        if (!tutorId) {
          return res.status(400).send({ error: true, message: "Tutor ID is required." });
        }

        // Find tutor details
        const tutor = await tutorsCollection.findOne({ _id: new ObjectId(tutorId) });
        if (!tutor) {
          return res.status(404).send({ error: true, message: "Tutor not found." });
        }

        // 1. Slot check: If tutor's totalSlot is 0, block booking
        if (tutor.totalSlot === undefined || tutor.totalSlot <= 0) {
          return res.status(400).send({ error: true, message: "Booking blocked: No slots available for this tutor." });
        }

        // 2. Date validation: If current date is earlier than session date, block the booking (as per instructions)
        const currentDate = new Date();
        const sessionDateObj = new Date(sessionDate || tutor.sessionDate);

        if (currentDate < sessionDateObj) {
          return res.status(400).send({ 
            error: true, 
            message: "Booking blocked: Current date is earlier than the session date." 
          });
        }

        const newBooking = {
          tutorId: new ObjectId(tutorId),
          userEmail,
          tutorEmail,
          price: Number(price || tutor.price),
          sessionDate: sessionDate || tutor.sessionDate,
          status: "booked",
          bookedAt: new Date()
        };

        const result = await bookingsCollection.insertOne(newBooking);

        // Automatically decrease the tutor's totalSlot by 1
        await tutorsCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $inc: { totalSlot: -1 } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Base route
    app.get('/', (req, res) => {
      res.send({ 
        status: "success", 
        message: "MediQueue Server is running smoothly!" 
      });
    });

  } catch (error) {
    console.error("Error connecting to MongoDB database:", error);
  }
}
run().catch(console.dir);

// Start server listening
app.listen(port, () => {
  console.log(`MediQueue Server is listening on port ${port}`);
});
