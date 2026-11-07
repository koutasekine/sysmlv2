// gr12-expose: 図の中の view の箱の expose の線 «expose»・«expose»*・«expose»**(GR12 P1 の裁定 Q5 の (b))
package Docs {
    part def Engine;
    package Parts {
        part def Wheel;
    }
    package Spares {
        part def Tire;
    }
    view detail {
        expose Engine;
        expose Parts::*;
        expose Spares::**;
    }
    view overview : StandardViewDefinitions::GeneralView {
        expose Docs::*;
    }
}
