try {
    require('./Src/modules/WorkOrder/Model/WorkOrderModel');
    console.log('Model OK');
    require('./Src/modules/WorkOrder/Repo/WorkOrderRepo');
    console.log('Repo OK');
    require('./Src/modules/WorkOrder/Service/WorkOrderWorkflowService');
    console.log('Service OK');
    require('./Src/modules/WorkOrder/Controller/WorkOrderController');
    console.log('Controller OK');
    require('./Src/modules/WorkOrder/Routes/WorkOrderRouter');
    console.log('Router OK');
    console.log('\nAll WorkOrder modules loaded successfully!');
} catch (e) {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
}
