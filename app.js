import express from "express";
import cors from "cors";



import organizationRoutes from "./routes/organization.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import alertRoutes from "./routes/alert.routes.js"
import userRoutes from "./routes/user.routes.js"
import settingsRoutes from "./routes/settings.routes.js"
import adminAuth from "./middlewares/admin.middleware.js";

import configRoutes from './routes/config.routes.js'
const app = express();

app.use(cors());
app.use(express.json());
// app.use("/health", (req, res, next) => { console.log("health routes"); next() }, (req, res) => res.json({ message: "Healthy" }));




app.use('/test', (req, res, next) => { console.log('qwert'); res.send("qwert") })
app.use("/config", configRoutes)
app.use("/api/v1/organizations", (req, res, next) => { console.log("organization routes"); next() }, organizationRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/alert", alertRoutes);
app.use("/api/v1/employee", employeeRoutes);
app.use("/api/v1/settings", settingsRoutes);
export default app;
