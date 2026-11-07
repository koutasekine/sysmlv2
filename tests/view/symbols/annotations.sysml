// comment-node・comment-without-keyword・comment-with-keyword・documentation-node・textual-representation-node・language-string・
// text-block・metadata-feature-annotation-node・metadata-feature-decl・metadata-feature-name-value-list・annotation-node・
// annotation-link
metadata def M {
    attribute level : Integer;
}
part p {
    part q;
    comment /* 名前のない注 */
    comment c about q locale "ja" /* 名前のある注 */
    doc /* 説明 */
    rep r language "c" /* x = 1; */
    @M {
        level = 2;
    }
}
