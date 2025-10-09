# TinyBF ドキュメント

## プロジェクト概要
TinyBF は Brainfuck をバックエンドに用いる簡潔な DSL（特定用途向け言語）です。Python 製の実行環境とトランスパイラ、そしてコマンドラインインターフェースを提供し、Brainfuck の知識がなくてもプログラムを作成・実行できます。変数は `num`（0〜255 の数値）と `char`（ASCII 文字）の 2 種類を扱えます。

- `tinybf.bf_interpreter` : Brainfuck インタープリタ
- `tinybf.transpiler` : TinyBF から Brainfuck へのトランスパイラ
- `python -m tinybf` : トランスパイルと実行を行う CLI

## メモリモデル
Brainfuck のテープ（バイト配列）をそのまま利用します。セル 0〜2 はトランスパイラの一時領域として確保され、それ以降にユーザー変数が順に割り当てられます。セルは 0〜255 の範囲で循環します。

## 言語仕様
TinyBF プログラムは 1 行 1 文で構成され、`#` 以降はコメントです。主な構文は以下の通りです。

### 変数定義
```
let num 変数名 = 式
let char 変数名 = 式
```
`式` は数値リテラル、文字リテラル（`'A'`, `'\n'` など）、または既存の変数名です。既存変数に対して使用すると同じ型で値を再設定します。`num` と `char` は相互に代入可能で、どちらも 1 バイト値として扱われます。
文字リテラルはシングルクォートで表記し、`\0`・`\n`・`\r`・`\t`・`\\`・`\'`・`\"` といったエスケープを利用できます。

### 代入
```
set 変数名 = expr
```
`expr` はリテラルまたは変数名です。`num` と `char` は相互に変換され、いずれも 0〜255 の範囲で格納されます。

### 加算・減算
```
add 変数名 expr
sub 変数名 expr
```
対象変数（`num` もしくは `char`）に対し `expr` を加算または減算します。`expr` は `num` と `char` のどちらでも指定でき、内部ではバイト加算（0〜255 の循環）が行われます。

### 乗算・除算
```
mul 変数名 オペランド
div 変数名 オペランド
```
`mul` は対象変数に対してリテラルまたは別の変数（`num`/`char`）との乗算を行います。`div` はリテラルまたは別の変数（`num`/`char`）で整数除算（商のみ）を行い、0 で割った場合は結果を 0 に設定します。

### 入出力
```
print_char 変数名   # 変数の値を ASCII 文字として出力
print_num 変数名    # 変数の値をそのまま 1 バイトとして出力
print_dec 変数名    # 変数の値を 10 進数文字列として出力
input_char 変数名   # 標準入力から 1 バイト読み込み（ EOF 時は 0 ）
input_num 変数名    # 標準入力から 1 バイト読み込み（ EOF 時は 0 ）
```
`print_num` は値をそのまま出力するため、10 進表記で表示したい場合は `print_dec` を利用するか、TinyBF 内で `'0'` などの文字を使って変換してください。`print_dec` は先頭に不要なゼロを付与せず、0 の場合のみ単一の `0` を出力します。

### 条件分岐
```
if 変数名 {
    ...
}
else {
    ...
}
```
条件変数が 0 以外なら `if` ブロック、0 の場合は `else` ブロックを実行します。条件変数の値は評価後も保持されます。`num`・`char` いずれの変数でも条件として利用可能です。

### 繰り返し
```
for 変数名 from expr to expr {
    ...
}
```
初期値を `from` の式で設定し、変数が `to` の式と等しくなるまで 1 ずつ増やしながらブロックを繰り返します。ループ変数および境界値は `num` 型である必要があります。

## CLI の使い方
TinyBF には `python -m tinybf` で呼び出せる CLI が付属しています。

```
python -m tinybf path/to/program.tbf              # Brainfuck を標準出力へ出力
python -m tinybf path/to/program.tbf --emit out.bf # Brainfuck をファイルへ書き出す
python -m tinybf path/to/program.tbf --run        # トランスパイル後に実行
python -m tinybf path/to/program.tbf --run --input "abc"  # 標準入力へ文字列を供給
```

`--emit` が指定されない場合は Brainfuck コードを標準出力に出力します。`--run` を付けると内部のインタープリタで即時実行し、プログラムの出力を標準出力に書き込みます。

## ビジュアライザ
Brainfuck の状態を 1 ステップずつ確認したい場合は、ビジュアライザを利用できます。

```
python -m tinybf.visualizer path/to/program.tbf
```

詳しい使い方は `docs/ja/visualizer.md` を参照してください。

## テスト
```
python -m unittest discover -s tests -v
```
ユニットテストではトランスパイラ、Brainfuck インタープリタ、CLI の挙動を網羅的に検証しています。
