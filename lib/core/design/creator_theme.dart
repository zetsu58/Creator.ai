import 'package:flutter/material.dart';

class CreatorTheme {
  static const bg = Color(0xFF070910);
  static const surface = Color(0xCC10141F);
  static const surfaceHigh = Color(0xB8171C2A);
  static const violet = Color(0xFF8B5CF6);
  static const cyan = Color(0xFF55D6FF);
  static const gold = Color(0xFFFFD76A);

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: violet,
      brightness: Brightness.dark,
      surface: surface,
    );

    return ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: bg,
      colorScheme: scheme,
      splashFactory: InkSparkle.splashFactory,
      dividerColor: Colors.white.withValues(alpha: .07),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: Colors.white.withValues(alpha: .09)),
          borderRadius: BorderRadius.circular(26),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -.25,
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xE60B0F17),
        indicatorColor: violet.withValues(alpha: .16),
        height: 70,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
          color: states.contains(WidgetState.selected) ? Colors.white : Colors.white54,
          fontSize: 11.5,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
        )),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: const Color(0x990B0F17),
        indicatorColor: violet.withValues(alpha: .16),
        selectedIconTheme: const IconThemeData(color: Colors.white),
        unselectedIconTheme: const IconThemeData(color: Colors.white54),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceHigh,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        hintStyle: const TextStyle(color: Colors.white38),
        labelStyle: const TextStyle(color: Colors.white60),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: .08)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: .08)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(color: violet.withValues(alpha: .85), width: 1.35),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white.withValues(alpha: .055),
        selectedColor: violet.withValues(alpha: .18),
        side: BorderSide(color: Colors.white.withValues(alpha: .08)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        shape: const StadiumBorder(),
        labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(56),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: -.1),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          side: BorderSide(color: Colors.white.withValues(alpha: .12)),
          shape: const StadiumBorder(),
          foregroundColor: Colors.white,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: const StadiumBorder(),
          foregroundColor: cyan,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: const Color(0xFF10141D),
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: const Color(0xF211151E),
        showDragHandle: true,
        dragHandleColor: Colors.white24,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: const Color(0xF211151E),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 18, vertical: 5),
        iconColor: Colors.white70,
      ),
    );
  }
}
