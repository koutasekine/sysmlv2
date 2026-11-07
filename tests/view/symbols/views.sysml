// viewpoint-def・viewpoint-def-name-compartment・viewpoint・viewpoint-name-compartment・view-def・view-def-name-compartment・
// view・view-name-compartment・exposes-compartment・filters-compartment・rendering-compartment・views-compartment・
// viewpoints-compartment・view-frame-info-compartment-br
part def P {
    viewpoint def VP;
    viewpoint vp;
    view def VD;
    view vw {
        expose q;
        filter @SysML::PartUsage;
        render asTreeDiagram;
        view vv;
        viewpoint vp2;
    }
    part q;
}
view everything {
    comment /* すべてを描く */
    expose P::**;
}
