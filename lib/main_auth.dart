import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/design/creator_theme.dart';
import 'core/localization/veyra_locale.dart';
import 'main.dart' as studio;
import 'screens/entry_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await VeyraLocaleController.instance.load();
  runApp(const VeyraProductionApp());
}

class VeyraProductionApp extends StatelessWidget {
  const VeyraProductionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Locale>(
      valueListenable: VeyraLocaleController.instance,
      builder: (context, locale, _) => MaterialApp(
        key: const Key('veyra_production_app'),
        debugShowCheckedModeBanner: false,
        title: 'Veyra AI',
        theme: CreatorTheme.dark(),
        locale: locale,
        supportedLocales: veyraLanguages.map((e) => Locale(e.code)).toList(),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: VeyraEntryGate(homeBuilder: (_) => const studio.CreatorHome()),
      ),
    );
  }
}
