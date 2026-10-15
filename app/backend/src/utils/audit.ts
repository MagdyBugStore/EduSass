import { Request } from 'express';
import { AuditLog } from '../models';

export const audit = (req: Request, action: string, entity: string, entityId?: any, meta?: any) =>
  AuditLog.create({ schoolId: req.user?.schoolId, userId: req.user?.id, action, entity, entityId, meta }).catch(() => {});
