import 'package:flutter/material.dart';

import '../core/api.dart';
import '../widgets/common.dart';

class ChildScreen extends StatelessWidget {
  final String id, name;
  const ChildScreen({super.key, required this.id, required this.name});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(name),
          bottom: const TabBar(
            isScrollable: true, tabAlignment: TabAlignment.start,
            labelColor: Colors.white, unselectedLabelColor: Colors.white70, indicatorColor: Color(0xFFFFE14D), indicatorWeight: 3,
            tabs: [Tab(text: 'نظرة عامة'), Tab(text: 'الحضور'), Tab(text: 'الدرجات'), Tab(text: 'المصروفات')],
          ),
        ),
        body: TabBarView(children: [_Overview(id), _Attendance(id), _Marks(id), _Fees(id)]),
      ),
    );
  }
}

class _Overview extends StatelessWidget {
  final String id;
  const _Overview(this.id);

  Widget _stat(String l, Object v, Color c) => Expanded(
        child: Card(child: Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Column(children: [
          Text('$v', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: c)),
          Text(l, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ]))),
      );

  @override
  Widget build(BuildContext context) {
    return Async<Map<String, dynamic>>(
      load: () => Api.I.get('/parent/children/$id/overview'),
      builder: (c, d) {
        final a = (d['attendance'] as Map).cast<String, dynamic>();
        final marks = d['latestMarks'] as List;
        final due = (d['due'] as num?) ?? 0;
        return ListView(padding: const EdgeInsets.all(16), children: [
          Row(children: [
            _stat('حضور', a['present'] ?? 0, Colors.green.shade700),
            _stat('غياب', a['absent'] ?? 0, Colors.red.shade700),
            _stat('تأخير', a['late'] ?? 0, Colors.orange.shade800),
          ]),
          Card(
            color: due > 0 ? Colors.orange.shade50 : null,
            child: ListTile(
              leading: Icon(due > 0 ? Icons.account_balance_wallet : Icons.verified, color: due > 0 ? Colors.orange.shade800 : Colors.green),
              title: Text(due > 0 ? 'مستحق: ${money(due)}' : 'لا توجد مستحقات'),
              subtitle: due > 0 ? const Text('راجع تبويب المصروفات') : null,
            ),
          ),
          const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 6), child: Text('آخر الدرجات', style: TextStyle(fontWeight: FontWeight.bold))),
          if (marks.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('لا توجد درجات بعد', style: TextStyle(color: Colors.grey))),
          for (final m in marks)
            Card(child: ListTile(
              title: Text('${m['examId']?['subjectId']?['name'] ?? ''} — ${m['examId']?['name'] ?? ''}'),
              trailing: Text('${m['score']}/${m['examId']?['maxScore']}', style: const TextStyle(fontWeight: FontWeight.bold)),
            )),
        ]);
      },
    );
  }
}

class _Attendance extends StatelessWidget {
  final String id;
  const _Attendance(this.id);
  @override
  Widget build(BuildContext context) {
    return Async<List<dynamic>>(
      load: () => Api.I.get('/parent/children/$id/attendance'),
      builder: (c, rows) {
        if (rows.isEmpty) return const EmptyText('لا توجد سجلات حضور');
        return ListView.separated(
          itemCount: rows.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (c, i) {
            final r = rows[i] as Map;
            final s = r['status'] as String;
            return ListTile(
              leading: Icon(Icons.circle, size: 14, color: statusColor(s)),
              title: Text(dateAr(r['date'])),
              subtitle: (r['reason'] ?? '').toString().isEmpty ? null : Text(r['reason']),
              trailing: Text(statusAr[s] ?? s, style: TextStyle(color: statusColor(s), fontWeight: FontWeight.bold)),
            );
          },
        );
      },
    );
  }
}

class _Marks extends StatelessWidget {
  final String id;
  const _Marks(this.id);
  @override
  Widget build(BuildContext context) {
    return Async<List<dynamic>>(
      load: () => Api.I.get('/parent/children/$id/marks'),
      builder: (c, rows) {
        if (rows.isEmpty) return const EmptyText('لا توجد درجات');
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: rows.length,
          itemBuilder: (c, i) {
            final m = rows[i] as Map;
            final e = (m['examId'] ?? {}) as Map;
            final max = (e['maxScore'] as num?) ?? 100;
            final pct = ((m['score'] as num) / max).clamp(0, 1).toDouble();
            return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('${e['subjectId']?['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold))),
                Text('${m['score']} / $max', style: const TextStyle(fontWeight: FontWeight.bold)),
              ]),
              Text('${e['name'] ?? ''} • ${dateAr(e['date'])}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: pct, minHeight: 6, borderRadius: BorderRadius.circular(3), color: pct >= .5 ? Colors.green : Colors.red),
            ])));
          },
        );
      },
    );
  }
}

class _Fees extends StatelessWidget {
  final String id;
  const _Fees(this.id);
  @override
  Widget build(BuildContext context) {
    return Async<Map<String, dynamic>>(
      load: () => Api.I.get('/parent/children/$id/invoices'),
      builder: (c, d) {
        final inv = d['invoices'] as List, pay = d['payments'] as List;
        if (inv.isEmpty) return const EmptyText('لا توجد فواتير');
        return ListView(padding: const EdgeInsets.all(12), children: [
          for (final i in inv)
            Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('فاتورة ${i['number']}', style: const TextStyle(fontWeight: FontWeight.bold))),
                Text(statusAr[i['status']] ?? i['status'], style: TextStyle(color: statusColor(i['status']), fontWeight: FontWeight.bold)),
              ]),
              const SizedBox(height: 6),
              for (final it in (i['items'] as List)) Text('• ${it['title']}: ${money(it['amount'])}', style: const TextStyle(fontSize: 13)),
              if ((i['discount'] ?? 0) > 0) Text('خصم: ${money(i['discount'])}', style: const TextStyle(fontSize: 13, color: Colors.green)),
              const Divider(),
              Text('الإجمالي ${money(i['total'])} • المدفوع ${money(i['paid'])} • المتبقي ${money((i['total'] as num) - (i['paid'] as num))}'),
              for (final s in (i['installments'] as List? ?? [])) Text('قسط ${dateAr(s['dueDate'])}: ${money(s['amount'])} (مدفوع ${money(s['paid'])})', style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ]))),
          if (pay.isNotEmpty) const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 6), child: Text('سجل الدفعات', style: TextStyle(fontWeight: FontWeight.bold))),
          for (final p in pay) ListTile(dense: true, leading: const Icon(Icons.receipt_long), title: Text(money(p['amount'])), subtitle: Text('${dateAr(p['date'])} • ${p['receiptNo'] ?? ''}')),
        ]);
      },
    );
  }
}
