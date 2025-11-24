// middlewares/validate.js
import { ZodError } from "zod";

export const validate = (schema, source = "body") => (req, res, next) => {
    try {
        const data =
            source === "query"
                ? req.query
                : source === "params"
                    ? req.params
                    : req.body;

        const parsed = schema.parse(data);
        // store validated data so controllers don't use raw body
        req.validated = {
            ...(req.validated || {}),
            [source]: parsed,
        };
        next();
    } catch (err) {
        if (err instanceof ZodError) {
            return res.status(400).json({
                message: "Validation error",
                errors: err.flatten(),
            });
        }
        next(err);
    }
};
