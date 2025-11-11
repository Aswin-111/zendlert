## Sign up 
#### Organization =>site => area (table)
- When clicked on get started a page is opened
- In that page there is an option to input business name
- Business name is then send to backend to check (Organizations table)[name]
- Backend will notifiy if the name exists
- The next page asks for email the email domain is checked 
- Then an otp is sent
- The name will be stored on users page
- The email domain name is extracted from the email 
- Email,  organization name, user full name , password is stored on Organizations table

- If everything is saved backend will send a confirmation
- In the next page it will ask for organization details

organizations
check-business-name(post)[business name]✅
check-email-domain(post)[email]✅
send-otp (post) [email]


verify otp (post) [email] is otp success save email_domain name




create-account✅
email domain , name (organization table)
full name , password hash, email, organization id (users table)
Organization details
- Organization admin phone , industry type (dropdown industry type table)

Site setup
- Site name, address 1, address 2, city , zip code, contact email
- Site setup will upload multiple sites



### Employee sign up
Full name  
email
phone
password

a low level employee can 
create a organization he will be the admin of the organization , he can send an invite email to higher officials
the officials will sign up as the employee automatically detecting the organization from the email
the admin can assign a the officials as admins from the      employee tab

### Admin dashboard
App's name and organization name is shown (from database)
Building's name from database

##### All alerts
- New alert button
- Alert type filter buttons (All , High )
- Search box
- Total alerts, response rate , response time , alert success




### Employee screen




#### Import employees
csv format 
first_name, last_name , email , phone , role , site , area
##### endpoints
import-employees post first_name, last_name , email , phone , role , site_id , area_id , is_contractor 
add-employees post first_name, last_name , email , phone , role , site_id , area_id , is_contractor 
    get-roles get org_id ✅
    get-sites get org_id ✅
    get-areas get org_id ✅
    get-contractors org_id ✅
    add-contracting-company org_id, name , email_address , phone, company_address ✅
    get-contracting-details       org_id ✅
    edit-contract-details org_id, company_id ✅
    get-contracting-active-employees org_id, company_id ✅
    delete-contractor org_id , company_id ✅

Employees page
overview org_id , => total_employees, permanent, contractors, pending verifications


get_employees?search=&status=&types=&sites= => Name, Status , Site , Area , is_employee if not company_name , phone , Role if role is admin
status = active , pending , inactive
types = 
roles = employee , admin
sites
 
edit-employee post first_name , last_name , email, phone , role, site, area, change to employee or contractor
user_type also can be changed here if a contractor's type changed to employee delete from contractor then create a record in employee table and vice versa

deactivate-employee emp_id
alerts-overview emp_id => name , date time , response time , status


access db
docker exec -it b4f61908a236 psql -U zendlertuser -d zendlert_db
docker exec -it b4f61908a236 psql -U postgres -d advocase

docker exec -i a4ae59e623d1 psql -U zendlertuser -d zendlert_db < zendlert_backup.sql

TRUNCATE TABLE "Organizations" RESTART IDENTITY CASCADE;