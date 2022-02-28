import express, { Request, Response } from "express";
const help_route = express.Router();

const fs = require("fs");

help_route.get('/', (req: Request, res: Response) => {
	res.sendFile("help.html", { root: __dirname });
});

export default help_route;