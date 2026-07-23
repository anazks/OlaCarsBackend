const mongoose = require('mongoose');
const { Writable } = require('stream');
require('dotenv').config();

const InvoiceController = require('../Src/modules/Invoice/Controller/InvoiceController');

async function testPdf() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const req = {
            query: { limit: '10' }
        };

        const headers = {};
        const bufferChunks = [];

        class MockRes extends Writable {
            constructor() {
                super();
                this.statusCode = 200;
            }
            setHeader(key, value) {
                headers[key] = value;
            }
            status(code) {
                this.statusCode = code;
                return this;
            }
            _write(chunk, encoding, callback) {
                bufferChunks.push(chunk);
                callback();
            }
            json(data) {
                console.log('JSON Error Response:', data);
            }
        }

        const res = new MockRes();
        res.on('finish', () => {
            const totalBuffer = Buffer.concat(bufferChunks);
            console.log('--- Invoice Registry PDF Test Results ---');
            console.log('Content-Type:', headers['Content-Type']);
            console.log('Content-Disposition:', headers['Content-Disposition']);
            console.log(`Generated PDF Size: ${totalBuffer.length} bytes`);
            if (totalBuffer.length > 500) {
                console.log('SUCCESS: Invoice Registry PDF generated cleanly!');
            } else {
                console.log('WARNING: PDF buffer small, check for errors.');
            }
        });

        await InvoiceController.downloadInvoiceRegistryPdf(req, res);

    } catch (err) {
        console.error('PDF Test Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testPdf();
