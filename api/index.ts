import type { Request, Response } from 'express';
import { startServer } from '../server.js';

const appPromise = startServer();

export default async function handler(req: Request, res: Response) {
  const app = await appPromise;
  return app(req, res);
}