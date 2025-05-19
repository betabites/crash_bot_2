import {NextFunction, Request, Response} from "express";
import {ZodError} from "zod";

export function AsyncEndpoint(originalMethod: (req: Request, res: Response, next: NextFunction) => PromiseLike<any>, autoNext = true) {
    async function replacementMethod(req: Request, res: Response, next: NextFunction) {
        try {
            await originalMethod(req, res, next)
            if (autoNext) next()
        } catch (e) {
            console.error(e)
            if (e instanceof ZodError) {
                res.status(400)
                res.send(e)
            }
            else next(e)
        }
    }
    return replacementMethod
}
