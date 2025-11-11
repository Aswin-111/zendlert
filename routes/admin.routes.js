import express from "express";
import AdminController from "../controllers/admin.controller.js";

const router = express.Router();

router.get("/organization-alerts", AdminController.getOrganizationAlerts);

router.post("/building-alerts", AdminController.getBuildingAlerts);
router.post("/getall-building-alerts", AdminController.getAllBuildingAlerts);
router.get("/getallareas",  (req, res, next) => { console.log("get all area route"); next() },AdminController.getAllAreasByOrganizationId);
// employee screen

router.get("/getallsites", AdminController.getAllSites);
router.get("/getall-areas", AdminController.getAllAreas);
router.get("/getareasbysite", AdminController.getAllAreas);
// employees page
router.get('/getall-roles', AdminController.getAllRoles);
// router.get("/employees", AdminController.getAllEmployees);   
// router.put("/employees", AdminController.updateEmployee);
router.post("/add-employee", AdminController.addEmployee);
// edit employee details 
// router.put("/edit-employee", AdminController.employeeEditDetails);


// In your routes file
router.put("/deactivate-employee", AdminController.deactivateEmployee);


// alerts


router.get('/alerts', AdminController.getAlerts);
router.post("/alerts" , AdminController.createAlert);


// notify users

router.post("/report-notification", AdminController.reportNotification);

// employee updated routes

// router.post('/importemployees', AdminController.importEmployees);


router.get("/getall-contractingcompanies" , AdminController.getAllContractingCompanies);

router.post("/create-contractingcompany", AdminController.createContractingCompany)
    // get all contracting companies of an organization

router.get("/get-contractingcompanies" , AdminController.getContractingCompanies);

// editing a contracting company
router.put("/edit-contractingcompany", AdminController.editContractingCompany)

// get active users of company
router.get('/get-contractingactiveemployees', AdminController.getContractingActiveEmployees);

// organization overview
router.get('/organization-overview', AdminController.getOrganizationOverview);

router.delete("/delete-contractingcompany", AdminController.deleteContractingCompany);

// get employees filter values
// fill filter values 
router.get('/get-filtervalues', AdminController.getFilterValues)
// get employees
router.get('/get-employees', AdminController.getEmployees);

// get employees overview
router.get("/get-employeedetails" , AdminController.employeeDetails)
// edit employees
router.put('/edit-employee', AdminController.editEmployee);
router.put('/toggle-employeestatus', AdminController.toggleEmployeeStatus);

// Sites
// get sites cards info
// total sites total     areas  total employees
router.get('/get-sites-cards', AdminController.getSitesCards);

// // Search Sites
// Get full list of sites of an organization , can be used to filter sites via status or site name passed as query
router.get('/search-sites', AdminController.searchSites);



// create sites 
// A site can be created with site_name , address , city , state , zipcode, site_contact_name, contact_email, contact_phone   
router.post('/sites', AdminController.createSite);

// create area from site overview
router.post('/areas', AdminController.createArea);

// site overview expanded
// areas's name , address , num of contractors and employees under the site id as query
router.post('/sites-overview', AdminController.siteOverview);
// edit area
// router.put('/areas', AdminController.editArea);
// delete area
router.delete('/areas', AdminController.deleteArea);


// sites popup 
// sites popup overview
// query = site_id
// name of the site , status ,current_count(total users count under the site),areas (total number of areas under the site), total_alerts ( count of all alerts , fetched from alert_sites ), average_response_time (average of time a contractor or employee of the site took to respond, fetching is a little tricky, it has to be fetched from the notification_recipients , connect alert sites, to alerts and sites , response_updated_at) , address , contact_name, contact_email
router.delete('/sites-popup-overview', AdminController.sitePopupOverview);

// sites popup areas
// query = site_id
// name , address,       num of employees , num of contractors

router.get('/sites/popup-areas', AdminController.sitePopupAreas);
// sites popup employees



// sound gallery english , tribal app translation, world map












// query = site_id
// employees (list of all employees with their area_name , area_address) 
router.get('/sites/popup-employees', AdminController.sitePopupEmployees);


// sites popup alert history
// name of the alert , status, time (duration of the alert), area_name, area_address, start_time( datetime of the beginning of the alert) safe , unsafe, not_responded (count of who all in the sites responded to the alert)
router.get('/sites-popup-alerts', AdminController.getSitePopupAlerts);  
// sites popup alert history


// average_response_time, response_times (area_name and their time took to respond to the alert)



// sites popup analytics
// get-site-analytics-card GET query organization_id=> organization's total_alerts, avg_response_time, organization_id
// 🆕 New analytics route
router.get("/get-site-analytics-card", AdminController.getSiteAnalyticsCard);
//  get-site-perfomance GET => site_name , site_perfomance (object of arrays   keys {site_name, num_of_alerts, total_people, performance(avg responded count in %),  }), 
// 🆕 New: Get site performance metrics
router.get("/get-site-performance", AdminController.getSitePerformance);
//  get-alert-distribution GET => alert_types , alert_type_count
router.get("/get-alert-distribution", AdminController.getAlertDistribution);
//  get-response-time-trend GET => site_name, average_response_time
router.get("/get-response-time-trend", AdminController.getResponseTimeTrend);
// alerts get alert history 
router.get("/alert-history", AdminController.getAlertHistory);
// ✅ Route: GET /admin/scheduled-alerts?organization_id=UUID
router.get("/scheduled-alerts", AdminController.getScheduledAlerts);
export default router;

// Total alerts , response rate , respoinse time , alert success ,active users , weather, builiding
// organization-alerts

// building-alerts => post [building name]recent alerts , upcoming and scheduled alerts, emergency contacts
// getallbuildingalerts => post [building name]
// employees screen 
//getallemployees post [organization_id]
// add new aemployee post [organization_id] full name, position , email , phone , admin access (boolean) , photo
// analytics page
// organization-analytics get [organization_id] => 
// / alerts
//     - Total active alerts
//     - Weekly alerts
//     - Monthly average
//     - Crtical alerts


//    / alert type distruvbiton
    //  - fire alerts
    //  - gas leaks
    //  - medical alerts
    //  - security

    
    // / response time
    
    // - average time
    // - fastest time 
    // - slowest time
    // - off hours average

// /building zone heat map

