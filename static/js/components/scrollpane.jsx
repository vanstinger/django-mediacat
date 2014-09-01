/**
 * @jsx React.DOM
 */
var React = require('react/addons');
var PureRenderMixin = require('react').addons.PureRenderMixin;
var cx = React.addons.classSet;


var ScrollPane = React.createClass({
  mixins: [PureRenderMixin],

  getInitialState: function() {
    return {
      scrollY: 0,
      scrollX: 0,
      width: null,
      height: null,
      contentWidth: null,
      contentHeight: null
    };
  },

  updateDOMDimensions: function() {
    var el = this.getDOMNode();
    var contentEl = el.querySelector(" .scrollpane-content");

    this.setState({
      width: el.offsetWidth,
      height: el.offsetHeight,
      contentWidth: contentEl.offsetWidth,
      contentHeight: contentEl.offsetHeight
    });
  },

  componentDidUpdate: function(prevProps, prevState) {
    if (prevProps.children !== this.props.children) {
      this.updateDOMDimensions();
    }
  },

  componentDidMount: function() {
    this.updateDOMDimensions();
    window.addEventListener('resize', this.updateDOMDimensions); 
  },

  componentWillUnmount: function() {
    window.removeEventListener('resize', this.updateDOMDimensions);
  },

  handleWheel: function(event) {
    var dY;
    var handleY;
    var newScrollX;
    var newScrollY;

    if (event.deltaY && this.state.contentHeight > this.state.height) {
      handleY = 100 * (this.state.height / this.state.contentHeight);
      dY = 100 * (event.deltaY / this.state.contentHeight);

      newScrollY = this.state.scrollY + dY;

      if (newScrollY > 100 - handleY) {
        newScrollY = 100 - handleY;
      } else if (newScrollY < 0) {
        newScrollY = 0;
      }
    }

    this.setState({
      scrollY: newScrollY
    });
  },

  render: function() {
    var readyToDisplay = this.state.width && this.state.height;
    var verticalHandleStyles;
    var horizontalHandleStyles;
    var contentStyles;
    var translateX = 0;
    var translateY = 0;

    if (readyToDisplay) {
      var shouldScrollHorizontal = this.state.contentWidth > this.state.width;
      var shouldScrollVertical = this.state.contentHeight > this.state.height;

      if (shouldScrollVertical) {
        var handleHeight = 100 * (this.state.height / this.state.contentHeight);

        verticalHandleStyles = {
          height: handleHeight + '%',
          top: this.state.scrollY + '%'
        };
        translateY = -this.state.scrollY;
      }

      contentStyles = {
        'transform': 'translate(' + translateX + '%, ' + translateY + '%)'
      };

      var viewportClasses = {
        'scrollpane-viewport': true,
        'scrollpane-viewport-vertical-scrollbar': shouldScrollVertical,
        'scrollpane-viewport-horizontal-scrollbar': shouldScrollHorizontal
      };

      return (
        <div className="scrollpane" onWheel={this.handleWheel}>
          {shouldScrollVertical &&
          <div className="scrollpane-scrollbar scrollpane-scrollbar-vertical">
            <div className="scrollpane-scrollbar-handle" style={verticalHandleStyles} />
          </div>}
          {shouldScrollHorizontal && <div className="scrollpane-scrollbar scrollpane-scrollbar-horizontal">
            <div className="scrollpane-scrollbar-handle" />
          </div>}
          <div className={cx(viewportClasses)}>
          <div className="scrollpane-content" style={contentStyles}>
            {this.props.children}
          </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="scrollpane scrollpane-loading">
          <div className="scrollpane-viewport">
          <div className="scrollpane-content">
            {this.props.children}
          </div>        
          </div>
        </div>
      );
    }
  }
});

module.exports = ScrollPane;