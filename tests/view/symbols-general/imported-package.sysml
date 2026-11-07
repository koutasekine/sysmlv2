// imported-package: 描く範囲のパッケージの名前空間の import(破線のパッケージ)と、要素 1 つの import(図の診断)
package App {
    private import Sensors::*;
    public import Actuators::**;
    public import Sensors::Probe;
}
package Sensors {
    part def Probe;
}
package Actuators;
