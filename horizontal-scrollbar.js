require('./h-scroller.scss');

export default {
    bindings: {
            scrolledComponents:  '=',
            scrollingComponents: '=',
            notifyingScroller:   '=', // come to inside from outer-comp.
            scrollerNotifying:   '=', // go to outside form this scroller.
            move             :   '<?moveSpan'
    },
    controllerAs: 'vm',
    template: require('./horizontal-scrollbar.html'),
    controller: horizontalScrollbarCompController
};

function horizontalScrollbarCompController(componentsApiCheck) {
    'ngInject';
    var unused;
    unused = componentsApiCheck;
}