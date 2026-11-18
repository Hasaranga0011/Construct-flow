// Synthetic BOQ used only by intercepted browser regression tests.
module.exports = function boqFixture(projectId) {
 const workId='00000000-0000-0000-0000-000000000201';
 const materialId='00000000-0000-0000-0000-000000000202';
 const boq={total_budget:2000,items_count:1,items:[{id:workId,activity_id:'A1',description:'Foundation BOQ work',stage:'Foundation',unit:'item',quantity:2,rate:1000,amount:2000}],materials:[{id:materialId,name:'BOQ cement',unit:'bags',allocated_quantity:10,unit_price:100}],labour_rates:[{trade:'Mason',daily_rate:4500,ot_rate:800}],labour_overrides:[],milestones:[{title:'Foundation',duration_days:5}]};
 return {project_name:'Fixture BOQ project',revision:1,boq_data:boq,project_budget:2250,workers:[{id:projectId,name:'Assigned QA Worker'}],history:[{revision:1,reason:'Initial project baseline',changed_at:'2026-11-17'}],unallocated_orders:1,unallocated_expenses:0,unallocated_records:[{table_name:'purchase_orders',id:projectId,label:'Legacy QA order'}],payroll_paid:4500,
 lines:[{id:workId,description:'Foundation BOQ work',kind:'work',active:true,stage:'Foundation',unit:'item',quantity:2,rate:1000,amount:2000,actual_cost:300,payment_scheduled:1000,approved_variations:250},{id:materialId,description:'BOQ cement',name:'BOQ cement',kind:'material',active:true,unit:'bags',quantity:10,allocated_quantity:10,rate:100,amount:1000,ordered_quantity:3,received_quantity:2,used_quantity:1,actual_cost:200,payment_scheduled:0,approved_variations:0}]};
};
