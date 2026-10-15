import { Request, Router } from 'express';
import { Model } from 'mongoose';
import { ZodTypeAny } from 'zod';
import { allow, requireModule, Role, tenant } from '../middleware/auth';
import { audit } from './audit';
import { HttpError, pageParams, wrap } from './http';

interface CrudOpts {
  name: string; // entity name for audit
  module?: string; // plan gate
  read?: Role[]; // extra roles allowed to read (owner/admin implicit)
  write?: Role[];
  schema?: ZodTypeAny; // create schema
  updateSchema?: ZodTypeAny;
  search?: string[];
  filters?: string[]; // query params copied to the filter
  populate?: any;
  sort?: any;
  beforeCreate?: (req: Request, data: any) => Promise<any> | any;
  afterCreate?: (req: Request, doc: any) => Promise<any> | any;
  beforeUpdate?: (req: Request, data: any) => Promise<any> | any;
  beforeDelete?: (req: Request, doc: any) => Promise<any> | any;
}

/** Tenant-scoped CRUD router. Every query is forced to the caller's schoolId. */
export function crud(M: Model<any>, o: CrudOpts) {
  const r = Router();
  const rd = o.read ?? [];
  const wr = o.write ?? [];
  if (o.module) r.use(requireModule(o.module));

  r.get('/', allow(...rd, ...wr), wrap(async (req, res) => {
    const q: any = { schoolId: tenant(req) };
    for (const f of o.filters || []) if (req.query[f] !== undefined && req.query[f] !== '') q[f] = req.query[f];
    const s = String(req.query.q || '').trim();
    if (s && o.search?.length) {
      const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = o.search.map((f) => ({ [f]: rx }));
    }
    const { page, limit, skip } = pageParams(req.query);
    let cur = M.find(q).sort(o.sort || { createdAt: -1 }).skip(skip).limit(limit);
    if (o.populate) cur = cur.populate(o.populate);
    const [items, total] = await Promise.all([cur.lean(), M.countDocuments(q)]);
    res.json({ items, total, page, limit });
  }));

  r.get('/:id', allow(...rd, ...wr), wrap(async (req, res) => {
    let cur = M.findOne({ _id: req.params.id, schoolId: tenant(req) });
    if (o.populate) cur = cur.populate(o.populate);
    const doc = await cur.lean();
    if (!doc) throw new HttpError(404, 'غير موجود');
    res.json(doc);
  }));

  r.post('/', allow(...wr), wrap(async (req, res) => {
    let data = o.schema ? o.schema.parse(req.body) : req.body;
    data = { ...data, schoolId: tenant(req) };
    if (o.beforeCreate) data = (await o.beforeCreate(req, data)) ?? data;
    const doc = await M.create(data);
    await o.afterCreate?.(req, doc);
    audit(req, 'create', o.name, doc._id);
    res.status(201).json(doc);
  }));

  r.put('/:id', allow(...wr), wrap(async (req, res) => {
    const sc = o.updateSchema ?? (o.schema && (o.schema as any).partial?.());
    let data = sc ? sc.parse(req.body) : { ...req.body };
    delete data.schoolId;
    if (o.beforeUpdate) data = (await o.beforeUpdate(req, data)) ?? data;
    const doc = await M.findOneAndUpdate({ _id: req.params.id, schoolId: tenant(req) }, data, { new: true, runValidators: true });
    if (!doc) throw new HttpError(404, 'غير موجود');
    audit(req, 'update', o.name, doc._id);
    res.json(doc);
  }));

  r.delete('/:id', allow(...wr), wrap(async (req, res) => {
    const doc = await M.findOne({ _id: req.params.id, schoolId: tenant(req) });
    if (!doc) throw new HttpError(404, 'غير موجود');
    await o.beforeDelete?.(req, doc);
    await doc.deleteOne();
    audit(req, 'delete', o.name, doc._id);
    res.json({ ok: true });
  }));
  return r;
}
