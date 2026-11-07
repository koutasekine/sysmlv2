// interface-def: インターフェースの定義(端は ends の区画)
package Plumbing {
    port def FuelPort;
    interface def FuelLine {
        end supply : FuelPort;
        end demand : FuelPort;
    }
}
