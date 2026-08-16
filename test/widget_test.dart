import 'package:creator_ai/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CreatorAI launches to Studio', (tester) async {
    await tester.pumpWidget(const CreatorAIApp());
    await tester.pumpAndSettle();

    expect(find.text('CreatorAI'), findsOneWidget);
    expect(find.text('Create with AI'), findsOneWidget);
    expect(find.text('Image Studio'), findsOneWidget);
    expect(find.text('Video'), findsOneWidget);
  });
}
