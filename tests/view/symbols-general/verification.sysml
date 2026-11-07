// verification: 検証の定義と使用(GR10 では汎用の箱。verify は objective の箱の verifies の区画)
package Tests {
    requirement massReq;
    verification def MassTest {
        objective {
            verify massReq;
        }
    }
    verification massTest : MassTest;
}
