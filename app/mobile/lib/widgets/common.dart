import 'package:flutter/material.dart';
import 'package:intl/intl.dart' hide TextDirection;

String money(num? n) => '${NumberFormat('#,##0.##', 'en').format(n ?? 0)} ج.م';

String dateAr(dynamic d) {
  if (d == null) return '—';
  final t = DateTime.tryParse(d.toString());
  return t == null ? d.toString() : DateFormat('yyyy/MM/dd', 'en').format(t.toLocal());
}

const statusAr = {
  'present': 'حاضر', 'absent': 'غائب', 'late': 'متأخر', 'excused': 'بعذر',
  'unpaid': 'غير مدفوعة', 'partial': 'مدفوعة جزئيًا', 'paid': 'مدفوعة',
};

Color statusColor(String s) => switch (s) {
      'present' || 'paid' => Colors.green.shade700,
      'absent' || 'unpaid' => Colors.red.shade700,
      'late' || 'partial' => Colors.orange.shade800,
      _ => Colors.blueGrey,
    };

/// Loads async data with loading / error / retry states.
class Async<T> extends StatefulWidget {
  final Future<T> Function() load;
  final Widget Function(BuildContext, T) builder;
  const Async({super.key, required this.load, required this.builder});

  @override
  State<Async<T>> createState() => _AsyncState<T>();
}

class _AsyncState<T> extends State<Async<T>> {
  late Future<T> _f = widget.load();
  void _reload() => setState(() => _f = widget.load());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _f,
      builder: (c, s) {
        if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (s.hasError) {
          return Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('${s.error}', textAlign: TextAlign.center),
              const SizedBox(height: 8),
              FilledButton(onPressed: _reload, child: const Text('إعادة المحاولة')),
            ]),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: widget.builder(c, s.data as T),
        );
      },
    );
  }
}

class EmptyText extends StatelessWidget {
  final String text;
  const EmptyText(this.text, {super.key});
  @override
  Widget build(BuildContext context) => ListView(children: [Padding(padding: const EdgeInsets.all(48), child: Center(child: Text(text, style: const TextStyle(color: Colors.grey))))]);
}
