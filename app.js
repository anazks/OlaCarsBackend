const express = require('express')
const app = express()
const dotenv = require('dotenv')
const cors = require('cors')
const connectDB = require('./Src/config/dbConfig')
const {createDefaultAdmin} = require('./Src/bootstrap/createDefaultAdmin')

dotenv.config()
const port = process.env.PORT
app.use(cors())

async function connectToDatabase() {
    try {
        await connectDB()
        await createDefaultAdmin(); //admin auto-create
        console.log('Database connection successful')
    } catch (error) {
        console.error('Database connection failed:', error.message)
    }
}
connectToDatabase()
app.get('/', (req, res) => {
  res.send('Hello World!!!!')
})
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
