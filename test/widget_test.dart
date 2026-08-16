import 'package:creator_ai/core/api/veyra_api.dart';
import 'package:creator_ai/main.dart';
import 'package:creator_ai/screens/wallet_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Veyra AI smoke test', (tester) async {
    await tester.pumpWidget(const CreatorAIApp());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('veyra_app')), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(CreatorHome), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Credit Center opens without localization lifecycle crash', (tester) async {
    final api = VeyraApi();

    await tester.pumpWidget(MaterialApp(
      home: CreditWalletPage(
        api: api,
        userId: 'widget-test-user',
        initialCredits: 100,
        backendOnline: false,
        onWalletChanged: () async {},
      ),
    ));

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const Key('credit_wallet_page')), findsOneWidget);
    expect(find.text('100'), findsOneWidget);
    expect(tester.takeException(), isNull);

    api.close();
  });
}
