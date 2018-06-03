require('./h-scroller.scss');

/*globals $:false*/

export default scrollingHandler;

/**
 * scrollbar {scroll(bar)Button, scroll(bar)Track, scroll(bar)TrackPiece,
 * scroll(bar)Thumb, scroll(bar)Corner [,resizer])
 *
 * scrolledComponents format: [{content: jqElement, container:jqElement}, {}, ...]
 * scrollingComponents format: {backwardBtn: id_str|element, forwardBtn: id_str|element,
 *                              scrollThumb: id_str|element, scrollTrack:id_str|element}
 * */
function scrollingHandler($document, $interval, $log)
{
    'ngInject';

    /**
     * scrollingComponents:
     * backwardBtn, forwardBtn;
     * scrollThumb, scrollTrack.
     **/
    return {
        scope: {
            scrolledComponents:  '=',
            scrollingComponents: '=',
            notifyingScroller:   '=', // come to inside from outer-comp.
            scrollerNotifying:   '=', // go to outside form this scroller.
            move             :   '<?moveSpan'
        },
        restrict: 'A',
        link: link
      };

    /**
     * The link function for the directive
     * @param {object} $scope the directive scope
     * @param {object} $element the DOM element
     * @param {object} $attributes attributes from the element
     */
    function link (scope, iElement, iAttrs) {
        var unused;
        unused = iAttrs;

        const defaultMove = 150;
        // ($.isNumeric(scope.move) && scope.move > 0)?scope.move:defaultMove;
        
        var myScrolledComponents = [];
        var backwardBtn, forwardBtn, scrollThumb, scrollTrack;
        var scrollTrackWidth = 2, scrollThumbWidth = 1;

        var dragStartX = 0, dragStartY = 0, dragX = 0, dragY = 0;
        var stopReProbingDim = false;
        var initAnimCompleteCount = 0;

        var refreshProbingCount = {scrolledCom:0, scrollingCom:0, docready:0};
    
        // if(iElement[0].nodeName === 'scroller') {}

        scope.internalNotifyingScroller = scope.notifyingScroller || {notice: null};
        scope.internalNotifyingScroller.notice = notifyingScroller;
                
        scope.render = scrollingMechanismRender;
        
        // WATCH 1: 'document.ready' and 'window.resize'
        $document.ready(function (){
            if(findProbingAction('docready'))
            {
                probingRenderAfterCssApplied();
            }
            $(window).resize(function() {
                stopReProbingDim = false;
                resizerHandler();
                resizeEventCompensate();
            });
        });

        // WATCH 2: 'scrollingComponents' at the case one of the property is 
        // jqElement will cause Error: 10 $digest() iterations reached. 
        // Aborting! with dynamic sortby predicate
        scope.$watch(function()
        {
            var checkValid = (scope.scrollingComponents)?true:false;
            var changeCountStr = '';

            if(!checkValid)
            {
                return changeCountStr;
            }

            var propertyName = ['backwardBtn', 'forwardBtn', 'scrollThumb', 'scrollTrack'];
            for(var i = 0, n = propertyName.length; i < n; i++)
            {
                changeCountStr += (typeof scope.scrollingComponents[propertyName[i]] === 'string')?
                    scope.scrollingComponents[propertyName[i]]:(scope.scrollingComponents[propertyName[i]])?
                    scope.scrollingComponents[propertyName[i]].length:0;
            }
            return changeCountStr;

        }, function(){
            stopReProbingDim = false;
            
            getScrollingComponents();
            
            if(findProbingAction('scrollingCom'))
            {
                probingRenderAfterCssApplied();
            }
        });

        // WATCH 3:  Using the 'scrolledComponents' will cause Error: 10 $digest() 
        // iterations reached. Aborting! with dynamic sortby predicate
        scope.$watch(function(){
            var checkValid = (scope.scrolledComponents)?scope.scrolledComponents.length:undefined;
            var changeCount = 0;

            if(!checkValid)
            {
                return changeCount;
            }

            for(var i = 0, n = scope.scrolledComponents.length; i < n; i++)
            { 
                changeCount += (scope.scrolledComponents[i].content)?scope.scrolledComponents[i].content.length:0;
                changeCount += (scope.scrolledComponents[i].container)?scope.scrolledComponents[i].container.length:0;
                
                var myChildren = (scope.scrolledComponents[i].content)?
                                    scope.scrolledComponents[i].content.children():undefined;
                var myChildren2 = (myChildren)?myChildren.children():undefined;
                var myChildren3 = (myChildren2)?myChildren2.children():undefined;
                
                changeCount += (myChildren)?myChildren.length:0;
                changeCount += (myChildren2)?myChildren2.length:0;
                changeCount += (myChildren3)?myChildren3.length:0;
            }
            
            $log.debug('WATCH 3: scrolledComponents: changeCount' + changeCount);
            return changeCount;

        }, function() {
            stopReProbingDim = false;
            initAnimCompleteCount = 0;
            
            myScrolledComponents = scope.scrolledComponents;
                        
            $log.debug('WATCH 3: scrolledComponents: resolve before -if-findProbingAction');
            
            if(findProbingAction('scrolledCom'))
            {
                $log.debug('WATCH 3: scrolledComponents: resolve after -if-findProbingAction');
                probingRenderAfterCssApplied();
            }
        }, true);

        // === *** === All function delarations: === *** ===

        // detect if it is to need action for probing (such as dim, etc) next.
        function findProbingAction (probingName)
        {
            var needProbing = false;
            
            refreshProbingCount[probingName] = 1;
            
            var needProbingCount = 0;
            for ( var prop in refreshProbingCount )
            {
                needProbingCount += (refreshProbingCount[prop])?1:0;
            }
            
            if(needProbingCount > 2)
            {
                needProbing = true;
            }
            
            return needProbing;
        }

        // use this at each time when the new components are comming up or changed.
        function scrollingMechanismRender()
        {
            // Add event functionality
            if(backwardBtn)
            {
                backwardBtn.off('click').click(leftScrolling);
            }

            if(forwardBtn)
            {
                forwardBtn.off('click').click(rightScrolling);
            }


            if(scrollThumb)
            {
                scrollThumb.css({
                    width: '60px',
                    cursor: 'pointer'
                });

                dragX = scrollThumb.position().left;
                scrollThumbWidth = scrollThumb.prop('offsetWidth');
                // dragY = scrollThumb.position().top;

                scrollThumb.off('mousedown').on('mousedown', function (event) {

                    reProbingDim();

                    // Prevent default dragging of selected content
                    event.preventDefault();
                    dragStartX = event.pageX - dragX;

                    $log.debug('Init: event.pageX: ' + event.pageX + ' dragX: ' + dragX + ' dragStartX: ' + dragStartX);
                    // dragStartY = event.pageY - dragY;
                    $document.on('mousemove', mousemove);
                    $document.on('mouseup', mouseup);
                });
            }
            
            getAllDimension();
        }

        var sliderLimits = []; // [0, 0]
        var scrollRatios  = [];
        var leftAnimCompleted = []; // [true, true];
        var rightAnimCompleted = [];
        // var initAnimCompleteCount = 0;
        function getAllDimension ()
        {
            if(initAnimCompleteCount === 0)
            {
                leftAnimCompleted = [];
                rightAnimCompleted = [];
            }

            // Get the scrolling components dimension
            if(scrollTrack)
            {
                scrollTrackWidth = scrollTrack.prop('clientWidth');
            }

            if(scrollThumb)
            {
                scrollThumbWidth = scrollThumb.prop('offsetWidth');
            }
            
            // Get the scrolled components dimension
             sliderLimits   = [];
             scrollRatios   = [];
             var agentWidth = null;

               
            if(!myScrolledComponents)
            {
                return;
            }
            
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                if(initAnimCompleteCount === 0)
                {
                    leftAnimCompleted.push(true);
                    rightAnimCompleted.push(true);
                }
                
                if(!myScrolledComponents[i].content || !myScrolledComponents[i].container)
                {
                    sliderLimits.push(0);
                    scrollRatios.push(0);
             
                    continue;
                }
                
                
                var contentWidth = myScrolledComponents[i].content.prop('clientWidth');
                var containerWidth = myScrolledComponents[i].container.prop('clientWidth');
                
                if(agentWidth === null)
                {
                    agentWidth = contentWidth - containerWidth;
                    
                    if(agentWidth <= 0)
                    {
                        agentWidth = null;
                    }
                }

                myScrolledComponents[i].contentWidth = contentWidth;
                myScrolledComponents[i].containerWidth = containerWidth;
                var scrollRatio;
                if(scrollTrack && scrollThumb)
                {
                    if(contentWidth > containerWidth)
                    {
                        // dx / dxt = w / wt = r --> dxt = dx / r; 'xt is thumb'
                        scrollRatio = (contentWidth - containerWidth) / (scrollTrackWidth - scrollThumbWidth);
                        
                        $log.debug('thumb-ratio: ----' + contentWidth + ':' + containerWidth + ':'+ 
                                   scrollTrackWidth + ':' + scrollThumbWidth + '::' + scrollRatio);
                           
                        scrollRatios.push(scrollRatio);
                    }
                    else
                    {
                        scrollRatios.push(0); 
                    }
                }
                else
                {
                    if(agentWidth === null || (contentWidth <= containerWidth))
                    {
                        scrollRatios.push(0);
                    }
                    else
                    {
                        // agentWidth !== null && contentWidth <= containerWidth
                        // dx/dxa = w/wa = r --> dxa = dx / r 'xa is agent'
                        scrollRatio = (contentWidth - containerWidth);
                        scrollRatio = scrollRatio / agentWidth;
                        
                        $log.debug('self-ratio: ----' + contentWidth + ':' + containerWidth + ':'+ 
                                    agentWidth + '::' + scrollRatio);
                           
                        scrollRatios.push(scrollRatio); 
                    } 
                }
               
                var myMove = ($.isNumeric(scope.move) && scope.move > 0)?scope.move:defaultMove;
                unused = myMove;
                var checkBuffer = 1;
                if(containerWidth < contentWidth)
                {
                    sliderLimits.push(containerWidth - (contentWidth - checkBuffer));  
                }
                else
                {
                    sliderLimits.push(0);
                }
            }
            
            initAnimCompleteCount++;
            if(initAnimCompleteCount > 0)
            {
                initAnimCompleteCount = 1;
            }
        }
        
        function probingRenderAfterCssApplied(){
            // Very rarely not get it after document-ready, in case it happen this will be temp solution to make sure
            // that the info is got after the css:classes are actually applied.
            var cancelAccout = 0;
            var myTimer = $interval(function(){
                cancelAccout++;
                
                scope.render();
                
                positioningScrolledComponents();
            
                positioningThumb();
                
                if(cancelAccout > 2)
                {
                    $interval.cancel(myTimer);
                }
            }, 300);

        }

        function resizerHandler () {
            
            getAllDimension();
            
            positioningScrolledComponents();
            
            positioningThumb();
        }

        var eventCompensateTimer = null;
        function resizeEventCompensate () {

            if(eventCompensateTimer !== null)
            {
                $interval.cancel(eventCompensateTimer);
            }

            var compensateCount = 0;
            eventCompensateTimer = $interval(function(){

                resizerHandler();
                compensateCount++;

                if(compensateCount > 3)
                {
                    $interval.cancel(eventCompensateTimer);
                    eventCompensateTimer = null;
                    compensateCount = 0;
                }
            }, 300);
        }

        function positioningScrolledComponents() {
            
            // === adjusting the scrolled component position when window resized === //
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                if(!myScrolledComponents[i].content || !myScrolledComponents[i].container)
                {
                    continue;
                }
                
                var myLeft = 0;
                if(myScrolledComponents[i].contentWidth > myScrolledComponents[i].containerWidth)
                {
                    // In the case, the case content width is larger than container.

                    var myRight = myScrolledComponents[i].content.position().left + 
                                  myScrolledComponents[i].contentWidth;
                    // delta between content.right to container.right.end   
                    var delta = myScrolledComponents[i].containerWidth - myRight;
                    
                    $log.debug('myRight: ' + myRight +' delta: ' + delta);
                
                    if(delta > 0)
                    {
                        myLeft = myScrolledComponents[i].content.position().left + delta;
                        myScrolledComponents[i].content.css({left:  myLeft + 'px'});
                    }
                }
                else
                {
                    myScrolledComponents[i].content.css({left:  myLeft});
                }
                // myScrolledComponents[i].content; container; contentWidth containerWidth;
            }
        }
        
        var thumbAnimComplete = true;
        function positioningThumb(animValue) {
            if(!scrollThumb) 
            {
                return;
            }
            
            var representer;
            var scrollRatio;
            
            var passThrough = true;
            
            if(animValue && thumbAnimComplete === false)
            {
                passThrough = false;
                return passThrough;
            }
            
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                if(myScrolledComponents[i].content && myScrolledComponents[i].container &&
                   myScrolledComponents[i].contentWidth && myScrolledComponents[i].containerWidth &&
                   (myScrolledComponents[i].contentWidth > myScrolledComponents[i].containerWidth) &&
                   scrollRatios[i])
                {
                    representer = myScrolledComponents[i];
                    scrollRatio = scrollRatios[i];
                                       
                    var myTargetLeft = representer.content.position().left;
                    // Use presice float instead of parseInt(representer.content.css("left"));
                    
                    if(scrollRatio === 0)
                    {
                        scrollRatio = 1;
                    }
                    var myThumbLeft = parseInt((0 - myTargetLeft) / scrollRatio);
                    
                    var checkThumbLeft = scrollThumb.position().left;
                    
                    $log.debug('positioningThumb - index: ' + i + 
                            ' contentWidth: ' + myScrolledComponents[i].contentWidth +
                            ' container: ' + myScrolledComponents[i].containerWidth + 
                            ' scrollRatio: ' + scrollRatio + ' myTargetLeft: ' + myTargetLeft + 
                            ' myThumbLeft: ' + myThumbLeft + ' checkThumbLeft: ' + checkThumbLeft);
                    
                    // Looks like duplicated error or otherwise, I don't know, need ...
                    if(!animValue || (animValue > 0 && (myThumbLeft > checkThumbLeft)) ||
                       (animValue < 0 && (myThumbLeft < checkThumbLeft)))
                    {
                        scrollThumb.css({left: myThumbLeft + 'px'});
                    }
                    
                    dragX = scrollThumb.position().left;
                    
                    break;
                }
            }
            
            // make sure that if scrollRatio is 0.00x then do not move thumb or
            // make the thumb whole.
            var thumbLeft, thumbRight;
            if(animValue)
            {
                thumbAnimComplete = false;
                
                var visualBuffer = (animValue > 0 && scrollRatio && scrollRatio < 0.05)?0.5:1;  
                var myMove = animValue * visualBuffer; 
                // Notice: switched to scrollingCom instead of 
                // scrolledCom, i.e. not use / scrollRatio;

                thumbLeft = parseInt(scrollThumb.position().left);
                thumbRight = thumbLeft + scrollThumbWidth;

                // Not let it be beyound right limit
                if(thumbRight + myMove > scrollTrackWidth)
                {
                    myMove = scrollTrackWidth - thumbRight;
                }
                // Not let it be beyound left limit
                if(thumbLeft + myMove < 0)
                {
                    myMove = 0 - thumbLeft;    
                }
                
                $log.debug('positioningThumb - index: ' + i + ' myMove: ' + myMove +
                           ' thumbLeft: ' + thumbLeft + ' scrollThumbWidth: ' + scrollThumbWidth +
                           ' scrollTrackWidth: ' + scrollTrackWidth +
                           ' thumbRight: ' + thumbRight + ' visualBuffer: ' + visualBuffer);
                    
                scrollThumb.stop(false,true)
                    .animate(
                    {left: '+='+(myMove+'px')},
                    {duration: 400,
                        complete: function() {

                        thumbAnimComplete = true;
 
                            var myTargetLeft2 = (representer)?representer.content.position().left:0;
                            var myThumbLeft2 = parseInt((0 - myTargetLeft2) / scrollRatio);

                             // Correcting Errors caused by number calculation around
                             if(myThumbLeft2 > (scrollTrackWidth-scrollThumbWidth)) 
                             {
                                myThumbLeft2 =  scrollTrackWidth-scrollThumbWidth;
                             }
                             else if (myMove === (0 - thumbLeft))
                             {
                                myThumbLeft2 = 0; 
                             }

                            $log.debug('positioningThumb - myThumbLeft2: ' + myThumbLeft2 +
                                     ' myTargetLeft2: ' + myTargetLeft2 +
                                     ' scrollTrackWidth: ' + scrollTrackWidth + 
                                     ' myThumbLeft2: ' + myThumbLeft2);
                             
                            scrollThumb.css({left: myThumbLeft2 + 'px'});

                            dragX = scrollThumb.position().left;
                    }}
                );
            }
            
            // === Beginning: Force thumb staying within the track range ===
            if(scrollTrack)
            {
                scrollTrackWidth = scrollTrack.prop('clientWidth');
            }

            thumbLeft = parseInt(scrollThumb.position().left);
            if(thumbLeft > (scrollTrackWidth - scrollThumbWidth))
            {
                thumbLeft = scrollTrackWidth - scrollThumbWidth;
                scrollThumb.css({left:  thumbLeft + 'px'});
            }
            // === End: Force thumb staying within the track range ===
            
            return passThrough;
        }
        
        function updateButtonStatus()
        {
            var test;
            test = 1;
        }
        unused = updateButtonStatus;
             
        function notifyingScroller(scrollTrend)
        {        
            $log.debug('notifyingScroller in scrollingHandler-directive: scrollTrend' + scrollTrend);
            
            // === Beginning: Synchronize scroll-ratio ===
            // In case thumb-ratio is 1, and scrolled-components-ratio is to time * 1.6666
            // Then thumb-ratio is 1/1.666, if scrolled-components-ratio is 1 at another scroller.
            var myScrollRatio = 1;
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                if(myScrolledComponents[i].content && myScrolledComponents[i].container &&
                   myScrolledComponents[i].contentWidth && myScrolledComponents[i].containerWidth &&
                   (myScrolledComponents[i].contentWidth > myScrolledComponents[i].containerWidth) &&
                   scrollRatios[i])
                {
                    myScrollRatio = scrollRatios[i];                
                    break;
                }
            }
           
            var myMoveSpan = ($.isNumeric(scope.move) && scope.move > 0)?scope.move:defaultMove;
            if(myScrollRatio === 0)
            {
                myScrollRatio = 1;
            }
            myMoveSpan /= myScrollRatio;
            
            // === End:  Synchronize scroll-ratio ===
            
            switch(scrollTrend) 
            {
                case 'forth':
                    positioningThumb(myMoveSpan);
                    break;
                case 'back':
                    positioningThumb(0 - myMoveSpan);
                    break;
                case 'end':
                    positioningThumb();
                    break;
                default:
                    positioningThumb();
                    break;
            }
            
        }
        
        function sendNotification (scrollTrend)
        {
            if(typeof scope.scrollerNotifying === 'function')
            {
                scope.scrollerNotifying(scrollTrend);
            }
        }
        
        function getScrollingComponents() {
            if(!scope.scrollingComponents)
            {
                return;
            }

            var backward = scope.scrollingComponents.backwardBtn;
            if(typeof backward === 'string')
            {
                backwardBtn = $(iElement).find(backward);
            }
            else if(backward && backward.length)
            {
                backwardBtn =  backward;
            }

            var forward = scope.scrollingComponents.forwardBtn;
            if(typeof forward === 'string')
            {
                forwardBtn = $(iElement).find(forward);
            }
            else if(forward && forward.length)
            {
                forwardBtn =  forward;
            }

            var thumb = scope.scrollingComponents.scrollThumb;
            if(typeof thumb === 'string')
            {
                scrollThumb = $(iElement).find(thumb);
            }
            else if(thumb && thumb.length)
            {
                scrollThumb =  thumb;
            }

            var track = scope.scrollingComponents.scrollTrack;
            if(typeof track === 'string')
            {
                scrollTrack = $(iElement).find(track);
            }
            else if(track && track.length)
            {
                scrollTrack =  track;
            }
        }

        // === Beginning: Dragging Scroll-Thumb ===
        // var dragStartX = 0, dragStartY = 0, dragX = 0, dragY = 0;
        unused = dragY;
        unused = dragStartY;

        function mousemove(event) {
            // at the previous time: dragStartX = event.pageX - dragX;
            dragX = event.pageX - dragStartX;
            if(dragX < 0)
            {
                dragX = 0;
            }
            else if(dragX > (scrollTrackWidth - scrollThumbWidth))
            {
                dragX = scrollTrackWidth - scrollThumbWidth;
            }

            for (var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                var myScrollRatio = scrollRatios[i];
                var myScrolledContentLeft = 0 - myScrollRatio * dragX;
                myScrolledContentLeft = parseInt(myScrolledContentLeft);

                myScrolledComponents[i].content.css({left: myScrolledContentLeft + 'px'});
            }

            scrollThumb.css({left:  dragX + 'px'});

            // dragY = event.pageY - dragStartY;
            // scrollThumb.css({top: dragY + 'px'});
        }

        function mouseup() {
            $document.off('mousemove', mousemove);
            $document.off('mouseup', mouseup);
        }

        // === End: Dragging Scroll-Thumb ====

        // === Beginning: build scrolling dimension info ===
        // var stopReProbingDim = false;
        function reProbingDim()
        {
            if(stopReProbingDim === false)
            {
                getAllDimension();
            }
            stopReProbingDim = true;
        }

        // === End: build scrolling dimension info ===

        // === Beginning: scrolling routines ===

        var completeCount = 0;
        // Moving/'Scrolling' the content in whole Backward to the 'Left' direction,
        // which looks the content in the view-port Forward as new content is comming.
        function leftScrolling() {

            reProbingDim();
            
            completeCountErrorCorrection();
            
            var myMoveSpan = ($.isNumeric(scope.move) && scope.move > 0)?scope.move:defaultMove;
 
            if(allowLeftScrollNotify())
            {
                positioningThumb(myMoveSpan);
                sendNotification('forth');
            }

            $log.debug('leftScrolling: Before -for- roop: ');

            var myScrollingContent;
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                var myScrollRatio = scrollRatios[i];
                var myMove = myMoveSpan * myScrollRatio;
                
                $log.debug('left-ratio: ----' + scrollRatios[i] + ' myMove: ' + myMove);
                
                myScrollingContent = myScrolledComponents[i].content;
                var sliderLimit = sliderLimits[i];
                var contentWidth = myScrolledComponents[i].contentWidth;
                var containerWidth = myScrolledComponents[i].containerWidth;

                $log.debug('leftScrolling: after -for- roop: before -if- ' + ' n: ' + n);
                if(leftAnimCompleted[i] === false) 
                {
                    return;
                }

                var currentPosition = myScrollingContent.position().left;
                // Use procise floating instead of parseInt(myScrollingContent.css("left"));
                
                $log.debug('leftScrolling: 1myScrollingContent.currentPosition: ' + currentPosition + 
                           ' sliderLimit: ' + sliderLimit + 
                           ' myMove: ' + myMove);
                 
                if (currentPosition >= sliderLimit) {
                    leftAnimCompleted[i] = false;

                    if (currentPosition + contentWidth - myMove < containerWidth) {
                        myMove = currentPosition + contentWidth - containerWidth;
                    }
                    myMove = (myScrollRatio === 0)?0:myMove; // do Not move if content within container.
                    
                    // In case not able moving atomically, This will Make moving to be effective 
                    // via its atomical satisfication
                    if((Math.abs(currentPosition + contentWidth - myMove) > 
                        Math.abs(containerWidth)) && Math.abs(myMove) < 1)
                    {
                        myMove = 1;
                    }
                    
                    $log.debug('leftScrolling: 2myScrollingContent.currentPosition: ' + currentPosition + 
                           ' sliderLimit: ' + sliderLimit + 
                           ' myMove: ' + myMove);
                   
                    myScrollingContent.stop(false,true)
                        .animate(
                        {left:'-='+(myMove+'px')},
                        {duration: 400,
                         complete: leftScrollingComplete}
                    );
                }
                else{
                    // Except at the End of track, It Should Never get here!!!
                    completeCount++;
                    
                    var checkElsePos = myScrollingContent.position().left;
                    
                    // Correcting Error caused by checkBuffer // Necessary to have the buffer !!!
                    var myMove2 = containerWidth - contentWidth;
                    myScrollingContent.css({left: myMove2}); 
                                
                    $log.debug('leftScrolling: else-before-if.2: completeCount++: ' + completeCount +
                                ' checkElsePos: ' + checkElsePos);
                    
                    leftAnimCompleted[i] = false;
                    if(leftAnimCompleted.length === completeCount)
                    {
                       $log.debug('leftScrolling: else-after-if.2: completeCount++: ' + completeCount);
                        
                       completeCount = 0;
                        for(var j = 0, m = leftAnimCompleted.length; j < m; j++)
                        {
                            leftAnimCompleted[j] = true;
                        }
                    }
                }
            }

            function leftScrollingComplete () {
                completeCount++;

                $log.debug('leftScrolling: anim: completeCount++: ' + completeCount+ ' n: ' + n +
                ' myMove: ' + myMove);

                if(leftAnimCompleted.length === completeCount)
                {
                    completeCount = 0;
                    sendNotification('end');

                    for(var j = 0, m = leftAnimCompleted.length; j < m; j++)
                    {
                        leftAnimCompleted[j] = true;
                    }
                }
            }
        }

        function allowLeftScrollNotify()
        {
            var allow = false;
            var count = 0;
            for(var j = 0, m = leftAnimCompleted.length; j < m; j++)
            {
                if(leftAnimCompleted[j] === true)
                {
                    count++;
                }
            }
            if(count === leftAnimCompleted.length)
            {
                allow = true;
            }
            
            return allow;
        }

        // Moving/'Scrolling' the content Forward to the 'Right' direction.
        // which looks the content in the view-port backward as old content is comming.
        function rightScrolling() {
            reProbingDim();
            
            var myMoveSpan = ($.isNumeric(scope.move) && scope.move > 0)?scope.move:defaultMove;
             
            completeCountErrorCorrection();
             
            if(allowRightScrollNotify())
            {
                positioningThumb(0-myMoveSpan);
                sendNotification('back');  
            }

            $log.debug('rightScrolling: before -for- roop: ');

            var myScrollingContent;
            for(var i = 0, n = myScrolledComponents.length; i < n; i++)
            {
                var myMove = myMoveSpan * scrollRatios[i];  
                
                $log.debug('right-i-ratio: ----' + i + ' : ' + scrollRatios[i] + ' myMove: ' + myMove);
                
                myScrollingContent = myScrolledComponents[i].content;
                
                $log.debug('rightScrolling: after -for- roop: before -if- ' + ' n: ' + n); 
                if(rightAnimCompleted[i] === false) 
                {
                    return;
                }

                var currentPosition = myScrollingContent.position().left; 
                // Use floating one instead of parseInt(myScrollingContent.css("left"));
                
                $log.debug('rightScrolling: myScrollingContent.currentPosition: ' + currentPosition + ' n: ' + n);

                if(currentPosition !== 0 && currentPosition + myMove > 0)
                {
                    myMove = 0 - currentPosition;
                }
                
                // In case not able moving atomically, This will Make moving to be effective 
                // via its atomical satisfication
                if(Math.abs(currentPosition) > Math.abs(myMove) && Math.abs(myMove) < 1)
                {
                    myMove = 1;
                }

                if (currentPosition < 0) {
                    rightAnimCompleted[i] = false;

                    myScrollingContent.stop(false,true)
                        .animate(
                        {left:'+='+(myMove+'px')},
                        {duration: 400,
                         complete: rightScrollingComplete}
                    );
                }
                else{
                    // Except at end of track, it Should Never get here!!!
                    completeCount++; 
                    
                    var checkElsePos = myScrollingContent.position().left;
                                
                    $log.debug('rightScrolling: else-before-if.2: completeCount++: ' + completeCount +
                                ' checkElsePos: ' + checkElsePos);
                     
                    rightAnimCompleted[i] = false;
                    if(rightAnimCompleted.length === completeCount)
                    {
                       $log.debug('rightScrolling: else-after-if.2: completeCount++: ' + completeCount);
                        
                       completeCount = 0;
                       for(var j = 0, m = rightAnimCompleted.length; j < m; j++)
                       {
                            rightAnimCompleted[j] = true;
                       }
                    }
                }
            }

            function rightScrollingComplete(){
                completeCount++;

                var checkCompletePos = myScrollingContent.position().left;
                $log.debug('rightScrolling: anim: completeCount++: ' + completeCount +
                ' checkCompletePos: ' + checkCompletePos);

                // Correctiong Error caused by Numbering-Around
                /*
                 if(Math.abs(checkCompletePos) < 0)
                 {
                 myScrollingContent.css({left: 0});
                 }
                 */

                if(rightAnimCompleted.length === completeCount)
                {
                    completeCount = 0;

                    $log.debug('rightScrolling: anim: completeCount++: ' + completeCount);

                    sendNotification('end');

                    for(var j =0, m = rightAnimCompleted.length; j < m; j++)
                    {
                        rightAnimCompleted[j] = true;
                    }
                }
            }
        }

        function allowRightScrollNotify()
        {
            var allow = false;
            var count = 0;
            for(var j = 0, m = rightAnimCompleted.length; j < m; j++)
            {
                if(rightAnimCompleted[j] === true)
                {
                    count++;
                }
            }
            if(count === rightAnimCompleted.length)
            {
                allow = true;
            }

            return allow;
        }
        
        function completeCountErrorCorrection()
        {
            // Should NEVER be here!!! just in case something wrong within unknown reason.
            if(completeCount > 2)
            {
                completeCount = 0;
                for(var i1 = 0, n1 = leftAnimCompleted.length; i1 < n1; i1++)
                {
                    leftAnimCompleted[i1] = true;
                }
                
                for(var i2 = 0, n2 = rightAnimCompleted.length; i2 < n2; i2++)
                {
                    rightAnimCompleted[i2] = true;
                }
            }
        }

        // === End: scrolling routines ===
    }

}

// module.exports = d3NgWrap;
