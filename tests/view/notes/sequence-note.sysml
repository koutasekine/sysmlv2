// sequence-note: シーケンスビューで、頭を注釈する注(GR14 の N。指示書 3.1 節)。N を入れると、注は注釈先の頭の上に置き、短い縦の線で結ぶ
package Q {
    occurrence def Talk {
        part a { event occurrence s; }
        part b { event occurrence r; }
        part c { event occurrence r2; }
        message m from a.s to b.r;
        message n from b.r to c.r2;
        comment about c /* 受け手の三つ目の部品の説明 */
        comment about a /* 最初の部品 */
    }
}
