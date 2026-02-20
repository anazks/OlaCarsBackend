const express = require('express')
const app = express()
const dotenv = require('dotenv')
const cors = require('cors')


dotenv.config()
const port = process.env.PORT
app.use(cors())

app.get('/', (req, res) => {
  res.send('Hello World!!!!')
})
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
