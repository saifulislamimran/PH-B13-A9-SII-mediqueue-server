const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('{/*path}', cors(corsOptions));
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
    const usersCollection = db.collection('users');
    const profileRequestsCollection = db.collection('profileRequests');
    const ledgerCollection = db.collection('ledger');

    // Admin Verification Middleware (must be called after verifyToken)
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const isAdmin = user?.role === 'admin';
        if (!isAdmin) {
          return res.status(403).send({ error: true, message: 'Forbidden access: Admin privilege required' });
        }
        next();
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    };
    
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
      
      // Ensure specialties is an array of strings
      if (tutor.specialties) {
        tutor.specialties = Array.isArray(tutor.specialties)
          ? tutor.specialties
          : [tutor.specialties].filter(Boolean);
      }
      
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

        // Log transaction in ledger (Inflow)
        const ledgerRecord = {
          bookingId: result.insertedId,
          amount: Number(price || tutor.price),
          type: "Inflow",
          description: `Booking for Tutor: ${tutor.name || tutorEmail}`,
          date: new Date(),
          createdAt: new Date()
        };
        await ledgerCollection.insertOne(ledgerRecord);

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Get tutors added by a specific user (Private Route)
    app.get('/my-tutors', verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        // Verify email from token matches query email
        if (req.decoded.email !== email) {
          return res.status(403).send({ error: true, message: 'Forbidden access: Email mismatch' });
        }
        const query = { email: email };
        const result = await tutorsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Get bookings made by a specific user (Private Route)
    app.get('/my-bookings', verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        // Verify email from token matches query email
        if (req.decoded.email !== email) {
          return res.status(403).send({ error: true, message: 'Forbidden access: Email mismatch' });
        }
        const query = { userEmail: email };
        const result = await bookingsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Cancel a Booking (Private Route)
    app.patch('/bookings/:id/cancel', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };

        // Find booking to verify ownership and check status
        const booking = await bookingsCollection.findOne(filter);
        if (!booking) {
          return res.status(404).send({ error: true, message: "Booking not found." });
        }

        // Verify the user owns the booking
        if (req.decoded.email !== booking.userEmail) {
          return res.status(403).send({ error: true, message: "Forbidden access: You do not own this booking." });
        }

        if (booking.status === "cancelled") {
          return res.status(400).send({ error: true, message: "Booking is already cancelled." });
        }

        // Update status to cancelled
        const updateDoc = {
          $set: { status: "cancelled" }
        };
        const updateResult = await bookingsCollection.updateOne(filter, updateDoc);

        // Restore tutor slot (+1)
        if (booking.tutorId) {
          await tutorsCollection.updateOne(
            { _id: new ObjectId(booking.tutorId) },
            { $inc: { totalSlot: 1 } }
          );
        }

        res.send(updateResult);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Create / Save a user (Standard User management)
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: 'User already exists', insertedId: null });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Get Admin Dashboard Stats (Private Admin Route)
    const getOverviewStats = async (req, res) => {
      try {
        const totalTutors = await tutorsCollection.countDocuments();
        const totalBookings = await bookingsCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();
        const totalStudents = await usersCollection.countDocuments({ role: 'student' });

        // Teacher counts grouped by specialty
        const teacherSpecialties = await tutorsCollection.aggregate([
          { $unwind: "$specialties" },
          { $group: { _id: "$specialties", count: { $sum: 1 } } }
        ]).toArray();

        // Student counts grouped by specialty
        const studentSpecialties = await usersCollection.aggregate([
          { $match: { role: 'student' } },
          { 
            $project: { 
              specialties: { 
                $cond: { 
                  if: { $isArray: "$specialties" }, 
                  then: "$specialties", 
                  else: { 
                    $cond: { 
                      if: { $and: [ { $ne: ["$specialties", null] }, { $ne: ["$specialties", undefined] } ] }, 
                      then: ["$specialties"], 
                      else: [] 
                    } 
                  } 
                } 
              } 
            } 
          },
          { $unwind: "$specialties" },
          { $group: { _id: "$specialties", count: { $sum: 1 } } }
        ]).toArray();

        // Cash flow stats from ledger
        const cashFlowStats = await ledgerCollection.aggregate([
          {
            $group: {
              _id: "$type",
              totalAmount: { $sum: "$amount" }
            }
          }
        ]).toArray();

        let totalInflow = 0;
        let totalOutflow = 0;

        cashFlowStats.forEach(stat => {
          if (stat._id === 'Inflow') {
            totalInflow = stat.totalAmount;
          } else if (stat._id === 'Outflow') {
            totalOutflow = stat.totalAmount;
          }
        });

        const totalRevenue = totalInflow;

        res.send({
          totalTutors,
          totalBookings,
          totalUsers,
          totalStudents,
          teacherSpecialties,
          studentSpecialties,
          totalRevenue,
          cashFlow: {
            totalInflow,
            totalOutflow,
            netBalance: totalInflow - totalOutflow
          }
        });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    };

    app.get('/admin-stats', verifyToken, verifyAdmin, getOverviewStats);
    app.get('/api/admin/overview-stats', verifyToken, verifyAdmin, getOverviewStats);

    // Update Tutor Approval/Remove Status (Private Admin Route)
    app.patch('/tutors/:id/status', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // e.g. "approved", "removed"

        if (!status) {
          return res.status(400).send({ error: true, message: "Status is required." });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status }
        };

        const result = await tutorsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Submit a profile update request (Private Route for Users)
    app.post('/api/users/request-update', verifyToken, async (req, res) => {
      try {
        const requesterEmail = req.decoded.email;
        const { name, email, role } = req.body;

        const requestedChanges = {};
        const status = {};

        if (name !== undefined) {
          requestedChanges.name = name;
          status.name = 'pending';
        }
        if (email !== undefined) {
          requestedChanges.email = email;
          status.email = 'pending';
        }
        if (role !== undefined) {
          requestedChanges.role = role;
          status.role = 'pending';
        }

        if (Object.keys(requestedChanges).length === 0) {
          return res.status(400).send({ error: true, message: "No valid fields provided for update request." });
        }

        const newRequest = {
          requesterEmail,
          requestedChanges,
          status,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await profileRequestsCollection.insertOne(newRequest);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Fetch all profile update requests (Admin Route)
    app.get('/api/admin/update-requests', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await profileRequestsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Approve or deny specific fields in a profile update request (Admin Route)
    app.patch('/api/admin/update-requests/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { actions } = req.body; // e.g. { name: "approved", email: "denied" }

        if (!actions || typeof actions !== 'object') {
          return res.status(400).send({ error: true, message: "Actions object is required." });
        }

        const requestFilter = { _id: new ObjectId(id) };
        const request = await profileRequestsCollection.findOne(requestFilter);
        if (!request) {
          return res.status(404).send({ error: true, message: "Update request not found." });
        }

        const updateFields = {};
        const requestStatusUpdates = {};

        for (const [field, action] of Object.entries(actions)) {
          if (request.requestedChanges[field] === undefined) {
            continue;
          }

          if (action === 'approved') {
            updateFields[field] = request.requestedChanges[field];
            requestStatusUpdates[`status.${field}`] = 'approved';
          } else if (action === 'denied') {
            requestStatusUpdates[`status.${field}`] = 'denied';
          }
        }

        if (Object.keys(requestStatusUpdates).length === 0) {
          return res.status(400).send({ error: true, message: "No valid action was processed." });
        }

        await profileRequestsCollection.updateOne(requestFilter, {
          $set: {
            ...requestStatusUpdates,
            updatedAt: new Date()
          }
        });

        if (Object.keys(updateFields).length > 0) {
          const userFilter = { email: request.requesterEmail };
          await usersCollection.updateOne(userFilter, {
            $set: updateFields
          });
        }

        res.send({ success: true, message: "Profile update request processed successfully." });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Manually Add a Tutor (Admin Route)
    app.post('/api/admin/tutors', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { name, email, password, price, totalSlot, specialties, image, details } = req.body;

        if (!name || !email || !password) {
          return res.status(400).send({ error: true, message: "Name, email, and password are required." });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ error: true, message: "User with this email already exists." });
        }

        // Hash credentials securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save credentials to users collection
        const newUser = {
          name,
          email,
          password: hashedPassword,
          role: 'tutor',
          createdAt: new Date()
        };
        const userResult = await usersCollection.insertOne(newUser);

        // Save tutor details to tutors collection
        const newTutor = {
          name,
          email,
          price: price !== undefined ? Number(price) : 0,
          totalSlot: totalSlot !== undefined ? Number(totalSlot) : 0,
          specialties: Array.isArray(specialties) ? specialties : [specialties].filter(Boolean),
          image: image || "",
          details: details || "",
          status: "approved", // auto approved if manually added by admin
          createdBy: req.decoded.email,
          createdAt: new Date()
        };
        const tutorResult = await tutorsCollection.insertOne(newTutor);

        res.status(201).send({
          success: true,
          message: "Tutor manually added successfully.",
          userId: userResult.insertedId,
          tutorId: tutorResult.insertedId
        });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Manually Add a Student (Admin Route)
    app.post('/api/admin/students', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { name, email } = req.body;

        if (!name) {
          return res.status(400).send({ error: true, message: "Student name is required." });
        }

        // Generate email if not provided
        const studentEmail = email || `student_${Date.now()}@mediqueue.com`;

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email: studentEmail });
        if (existingUser) {
          return res.status(400).send({ error: true, message: "User with this email already exists." });
        }

        // Auto-generate password
        const tempPassword = Math.random().toString(36).slice(-8) + 'St1!';
        
        // Hash password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        // Save credentials to users collection
        const newUser = {
          name,
          email: studentEmail,
          password: hashedPassword,
          role: 'student',
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);

        res.status(201).send({
          success: true,
          message: "Student manually registered successfully.",
          userId: result.insertedId,
          credentials: {
            email: studentEmail,
            password: tempPassword
          }
        });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Create a transaction record (Admin Route)
    app.post('/api/ledger', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { amount, type, description, date } = req.body;

        if (!amount || !type || !description) {
          return res.status(400).send({ error: true, message: "Amount, type (Inflow/Outflow), and description are required." });
        }

        if (type !== 'Inflow' && type !== 'Outflow') {
          return res.status(400).send({ error: true, message: "Type must be either 'Inflow' or 'Outflow'." });
        }

        const newLedger = {
          amount: Number(amount),
          type,
          description,
          date: date ? new Date(date) : new Date(),
          createdAt: new Date()
        };

        const result = await ledgerCollection.insertOne(newLedger);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Fetch ledger data with date filtering and summary totals (Admin Route)
    app.get('/api/ledger', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { filter } = req.query; // daily, weekly, monthly
        const query = {};

        if (filter) {
          const now = new Date();
          let startDate;

          if (filter === 'daily') {
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
          } else if (filter === 'weekly') {
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);
          } else if (filter === 'monthly') {
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 1);
          }

          if (startDate) {
            query.date = { $gte: startDate };
          }
        }

        const transactions = await ledgerCollection.find(query).sort({ date: -1 }).toArray();

        let totalInflow = 0;
        let totalOutflow = 0;

        transactions.forEach(tx => {
          if (tx.type === 'Inflow') {
            totalInflow += tx.amount;
          } else if (tx.type === 'Outflow') {
            totalOutflow += tx.amount;
          }
        });

        res.send({
          transactions,
          summary: {
            totalInflow,
            totalOutflow,
            netBalance: totalInflow - totalOutflow
          }
        });
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
