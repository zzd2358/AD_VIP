// ==UserScript==
// @name 修改浏览器UA
// @namespace http://tampermonkey.net/
// @version 0.2
// @description 作用是修改浏览器UA
// @author xk
// @match https:///
// @grant none
// @include *
// @run-at document-start
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/496165/%E4%BF%AE%E6%94%B9%E6%B5%8F%E8%A7%88%E5%99%A8UA%E5%B9%B3%E5%8F%B0%E4%B8%BA%E6%A1%8C%E9%9D%A2%E7%AB%AF.user.js
// @updateURL https://update.greasyfork.org/scripts/496165/%E4%BF%AE%E6%94%B9%E6%B5%8F%E8%A7%88%E5%99%A8UA%E5%B9%B3%E5%8F%B0%E4%B8%BA%E6%A1%8C%E9%9D%A2%E7%AB%AF.meta.js
// ==/UserScript==
 
(function() {
'use strict';
Object.defineProperty(navigator,'platform',{get:function(){return 'iOS';}});
Object.defineProperty(navigator,'userAgent',{get:function(){return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';}});
// Your code here...
})();