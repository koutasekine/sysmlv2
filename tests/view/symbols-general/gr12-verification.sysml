// gr12-verification: 検証の定義と使用(subject は節点)と、objective の verify の線 «verify»(GR12 P1 の裁定 Q1・Q2 の (g))
package Tests {
    requirement massReq;
    verification def MassTest {
        subject unit;
        objective {
            verify massReq;
        }
    }
    verification massTest : MassTest;
}
