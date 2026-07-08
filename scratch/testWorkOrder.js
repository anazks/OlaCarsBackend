const mongoose = require('mongoose');
const connectDB = require('../Src/config/dbConfig');
const { createWorkOrderHandler } = require('../Src/modules/WorkOrder/Controller/WorkOrderController');
require('dotenv').config();

async function test() {
    await connectDB();
    console.log("Connected to DB");
    
    try {
        const req = {
            body: {
                workOrderType: "PREVENTIVE",
                vehicleId: new mongoose.Types.ObjectId("6a293eb72cb35dd4717a10a0"), // dummy vehicle ID
                branchId: new mongoose.Types.ObjectId("6a293ea52cb35dd4717a1064"), // branch ID where the parts exist
                faultDescription: "Preventive maintenance scheduled check"
            },
            user: {
                id: new mongoose.Types.ObjectId(),
                role: "WORKSHOPMANAGER",
                branchId: new mongoose.Types.ObjectId("6a293ea52cb35dd4717a1064")
            }
        };

        const res = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(payload) {
                this.payload = payload;
                return this;
            }
        };

        console.log("Calling createWorkOrderHandler...");
        await createWorkOrderHandler(req, res);
        
        console.log("Response status:", res.statusCode);
        console.log("Response success:", res.payload.success);
        if (res.payload.success) {
            const wo = res.payload.data;
            console.log("Created Work Order Number:", wo.workOrderNumber);
            console.log("Tasks count:", wo.tasks.length);
            console.log("Tasks:", wo.tasks.map(t => t.description));
            console.log("Parts count:", wo.parts.length);
            console.log("Parts assigned:", wo.parts.map(p => ({
                partNumber: p.partNumber,
                partName: p.partName,
                status: p.status,
                unitCost: p.unitCost
            })));
            console.log("Estimated Parts Cost:", wo.estimatedPartsCost);
            console.log("Estimated Total Cost:", wo.estimatedTotalCost);
        } else {
            console.error("Handler error message:", res.payload.message);
        }
    } catch (error) {
        console.error("Test execution failed!", error);
    } finally {
        await mongoose.connection.close();
    }
}

test();
