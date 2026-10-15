import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'غير موجود' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, code: err.code });
  if (err instanceof ZodError)
    return res.status(400).json({
      message: 'بيانات غير صحيحة',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  if (err?.code === 11000) return res.status(409).json({ message: 'القيمة موجودة بالفعل', keys: err.keyValue });
  if (err?.name === 'CastError') return res.status(400).json({ message: 'معرّف غير صحيح' });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'خطأ في الخادم' });
}
