const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
