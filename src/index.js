import ajax from './ajax';
import './index.less';

function deepClone(obj) {
   return JSON.parse(JSON.stringify(obj));
}

function uniq(arr) {
   const map = {};
   return arr.reduce((acc, item) => {
      if (!map[item]) {
         map[item] = true;
         acc.push(item);
      }
      return acc;
   }, []);
}

function empty(ele) {
   while (ele.firstChild) {
      ele.removeChild(ele.firstChild);
   }
}

function animation(duration, callback) {
   requestAnimationFrame(() => {
      callback.enter();
      requestAnimationFrame(() => {
         callback.active();
         setTimeout(() => {
            callback.leave();
         }, duration);
      });
   });
}

function parseBoolean(s) {
   if (s === true || s === 'true') {
      return true;
   } else if (s === false || s === 'false' || s === 'null') {
      return false;
   } else {
      return !!s;
   }
}

export default function NativeCheckBoxTree(container, options) {
   const defaultOptions = {
      values: [],
      disables: [],
      beforeLoad: null,
      loaded: null,
      url: null,
      method: 'GET',
      closeDepth: null,
      name: null,
   };
   this.treeNodes = [];
   this.nodesById = {};
   this.leafNodesById = {};
   this.liElementsById = {};
   this.checkboxElementsById = {};
   this.willUpdateNodesById = {};
   this.container = container;
   this.options = Object.assign(defaultOptions, options);

   Object.defineProperties(this, {
      leafLength: {
         get: function() {
            return Object.keys(this.leafNodesById).length;
         },
      },
      indeterminate: {
         get: function() {
            let leafs = this.leafNodesById;
            let leaf_enabled_checked = 0, leaf_enabled_all = 0;

            for (let id in leafs) {
               let leaf = leafs[id];
               if (!leaf.disabled) {
                  leaf_enabled_all += 1;
                  if (leaf.status > 0) {
                     leaf_enabled_checked += 1;
                  }
               }
            }
            return !(leaf_enabled_checked === 0 || leaf_enabled_all === leaf_enabled_checked);
         },
      },
      values: {
         get() {
            return this.getValues();
         },
         set(values) {
            const vtypestr = typeof values;
            let normalizedValues = [];
            if (values) {
               if (Array.isArray(values)) {
                  normalizedValues = uniq(values);
               } else if (vtypestr === 'string') {
                  if (values === '*') {
                     normalizedValues = this.treeNodes.map(function(n) {
                        return n.id;
                     });
                  } else {
                     normalizedValues.push(values);
                  }
               } else {
                  throw new TypeError('unexpected "values" value');
               }
            }
            return this.setValues(normalizedValues);
         },
      },
      disables: {
         get() {
            return this.getDisables();
         },
         set(values) {
            return this.setDisables(uniq(values));
         },
      },
      selectedNodes: {
         get() {
            let nodes = [];
            let nodesById = this.nodesById;
            for (let id in nodesById) {
               if (
                  nodesById.hasOwnProperty(id) &&
                  (nodesById[id].status === 1 || nodesById[id].status === 2)
               ) {
                  const node = Object.assign({}, nodesById[id]);
                  delete node.parent;
                  delete node.children;
                  nodes.push(node);
               }
            }
            return nodes;
         },
      },
      disabledNodes: {
         get() {
            let nodes = [];
            let nodesById = this.nodesById;
            for (let id in nodesById) {
               if (nodesById.hasOwnProperty(id) && nodesById[id].disabled) {
                  let node = Object.assign({}, nodesById[id]);
                  delete node.parent;
                  nodes.push(node);
               }
            }
            return nodes;
         },
      },
   });

   if (this.options.url) {
      this.load(data => {
         this.init(data);
      });
   } else {
      this.init(this.options.data);
   }
}

NativeCheckBoxTree.prototype.init = function(data) {
   console.time('init');
   let {
      treeNodes,
      nodesById,
      leafNodesById,
      defaultValues,
      defaultDisables,
   } = NativeCheckBoxTree.parseTreeData(data);
   this.treeNodes = treeNodes;
   this.nodesById = nodesById;
   this.leafNodesById = leafNodesById;
   this.render(this.treeNodes);
   const {values, disables, loaded} = this.options;
   if (values && values.length) defaultValues = values;
   defaultValues.length && this.setValues(defaultValues);
   if (disables && disables.length) defaultDisables = disables;
   defaultDisables.length && this.setDisables(defaultDisables);
   loaded && loaded.call(this);
   this.createObserver();
   console.timeEnd('init');
};

NativeCheckBoxTree.prototype.load = function(callback) {
   console.time('load');
   const {url, method, beforeLoad} = this.options;
   ajax({
      url,
      method,
      success: result => {
         let data = result;
         console.timeEnd('load');
         if (beforeLoad) {
            data = beforeLoad(result);
         }
         callback(data);
      },
   });
};

NativeCheckBoxTree.prototype.render = function(treeNodes) {
   this.treeEle = NativeCheckBoxTree.createRootEle();
   this.treeEle.appendChild(this.buildTree(treeNodes, 0));
   this.bindClickOnTreeEvent(this.treeEle);
   this.bindCheckBoxesEvents();
   const ele = document.querySelector(this.container);
   empty(ele);
   ele.appendChild(this.treeEle);
};

NativeCheckBoxTree.prototype.buildTree = function(nodes, depth) {
   const rootUlEle = NativeCheckBoxTree.createUlEle();
   if (nodes && nodes.length) {
      nodes.forEach(node => {
         const [liEle, checkboxEl] = NativeCheckBoxTree.createLiEle(
            node,
            depth === this.options.closeDepth - 1,
            this.options.name
         );
         this.liElementsById[node.id] = liEle;
         this.checkboxElementsById[node.id] = checkboxEl;

         let ulEle = null;
         if (node.children && node.children.length) {
            ulEle = this.buildTree(node.children, depth + 1);
         }
         ulEle && liEle.appendChild(ulEle);
         rootUlEle.appendChild(liEle);
      });
   }
   return rootUlEle;
};

NativeCheckBoxTree.prototype.bindClickOnTreeEvent = function(ele) {
   ele.addEventListener(
      'click',
      e => {
         const {target} = e;
         if (
            target.nodeName === 'LI' &&
            target.classList.contains('NCT-node')
         ) {
            this.onItemClick(target.dataset.id);
         } else if (
            target.nodeName === 'SPAN' &&
            target.classList.contains('NCT-switcher')
         ) {
            this.onSwitcherClick(target);
         }
      },
      false
   );
};

NativeCheckBoxTree.prototype.bindCheckBoxesEvents = function() {
   Object.values(this.checkboxElementsById).forEach(checkbox => {
      checkbox.addEventListener(
         'change',
         e => {
            const {target} = e;
            this.onItemClick(target.dataset.id);
         },
         false
      );
   });
};

NativeCheckBoxTree.prototype.onItemClick = function(id) {
   console.time('onItemClick');
   const node = this.nodesById[id];
   const {onChange} = this.options;
   if (!node.disabled) {
      this.setValue(id);
      this.updateLiElements();
   }
   onChange && onChange.call(this);
   console.timeEnd('onItemClick');
};

NativeCheckBoxTree.prototype.setValue = function(value) {
   const node = this.nodesById[value];
   if (!node) return;
   const prevStatus = node.status;
   const status = prevStatus === 1 || prevStatus === 2 ? 0 : 2;
   node.status = status;
   this.markWillUpdateNode(node);
   this.walkUp(node, 'status');
   this.walkDown(node, 'status');
};

NativeCheckBoxTree.prototype.getValues = function() {
   const values = [];
   for (let id in this.leafNodesById) {
      if (this.leafNodesById.hasOwnProperty(id)) {
         if (
            this.leafNodesById[id].status === 1 ||
            this.leafNodesById[id].status === 2
         ) {
            values.push(id);
         }
      }
   }
   return values;
};

NativeCheckBoxTree.prototype.setValues = function(values) {
   this.emptyNodesCheckStatus();
   values.forEach(value => {
      this.setValue(value);
   });
   this.updateLiElements();
   const {onChange} = this.options;
   onChange && onChange.call(this);
};

NativeCheckBoxTree.prototype.setDisable = function(value) {
   const node = this.nodesById[value];
   if (!node) return;
   const prevDisabled = node.disabled;
   if (!prevDisabled) {
      node.disabled = true;
      this.markWillUpdateNode(node);
      this.walkUp(node, 'disabled');
      this.walkDown(node, 'disabled');
   }
};

NativeCheckBoxTree.prototype.getDisables = function() {
   const values = [];
   for (let id in this.leafNodesById) {
      if (this.leafNodesById.hasOwnProperty(id)) {
         if (this.leafNodesById[id].disabled) {
            values.push(id);
         }
      }
   }
   return values;
};

NativeCheckBoxTree.prototype.setDisables = function(values) {
   this.emptyNodesDisable();
   values.forEach(value => {
      this.setDisable(value);
   });
   this.updateLiElements();
};

NativeCheckBoxTree.prototype.emptyNodesCheckStatus = function() {
   this.willUpdateNodesById = this.getSelectedNodesById();
   Object.values(this.willUpdateNodesById).forEach(node => {
      if (!node.disabled) node.status = 0;
   });
};

NativeCheckBoxTree.prototype.emptyNodesDisable = function() {
   this.willUpdateNodesById = this.getDisabledNodesById();
   Object.values(this.willUpdateNodesById).forEach(node => {
      node.disabled = false;
   });
};

NativeCheckBoxTree.prototype.getSelectedNodesById = function() {
   return Object.entries(this.nodesById).reduce((acc, [id, node]) => {
      if (node.status === 1 || node.status === 2) {
         acc[id] = node;
      }
      return acc;
   }, {});
};

NativeCheckBoxTree.prototype.getDisabledNodesById = function() {
   return Object.entries(this.nodesById).reduce((acc, [id, node]) => {
      if (node.disabled) {
         acc[id] = node;
      }
      return acc;
   }, {});
};

NativeCheckBoxTree.prototype.updateLiElements = function() {
   Object.values(this.willUpdateNodesById).forEach(node => {
      this.updateLiElement(node);
   });
   this.willUpdateNodesById = {};
};

NativeCheckBoxTree.prototype.markWillUpdateNode = function(node) {
   this.willUpdateNodesById[node.id] = node;
};

NativeCheckBoxTree.prototype.onSwitcherClick = function(target) {
   const liEle = target.parentNode;
   const ele = liEle.lastChild;
   const height = ele.scrollHeight;
   if (liEle.classList.contains('NCT-node__close')) {
      animation(150, {
         enter() {
            ele.style.height = 0;
            ele.style.opacity = 0;
         },
         active() {
            ele.style.height = `${height}px`;
            ele.style.opacity = 1;
         },
         leave() {
            ele.style.height = '';
            ele.style.opacity = '';
            liEle.classList.remove('NCT-node__close');
         },
      });
   } else {
      animation(150, {
         enter() {
            ele.style.height = `${height}px`;
            ele.style.opacity = 1;
         },
         active() {
            ele.style.height = 0;
            ele.style.opacity = 0;
         },
         leave() {
            ele.style.height = '';
            ele.style.opacity = '';
            liEle.classList.add('NCT-node__close');
         },
      });
   }
};

NativeCheckBoxTree.prototype.walkUp = function(node, changeState) {
   const {parent} = node;
   if (parent) {
      if (changeState === 'status') {
         let pStatus = null;
         const statusCount = parent.children.reduce((acc, child) => {
            if (!isNaN(child.status)) return acc + child.status;
            return acc;
         }, 0);
         if (statusCount) {
            pStatus = statusCount === parent.children.length * 2 ? 2 : 1;
         } else {
            pStatus = 0;
         }
         if (parent.status === pStatus) return;
         parent.status = pStatus;
      } else {
         const pDisabled = parent.children.reduce(
            (acc, child) => acc && child.disabled,
            true
         );
         if (parent.disabled === pDisabled) return;
         parent.disabled = pDisabled;
      }
      this.markWillUpdateNode(parent);
      this.walkUp(parent, changeState);
   }
};

NativeCheckBoxTree.prototype.walkDown = function(node, changeState) {
   if (node.children && node.children.length) {
      node.children.forEach(child => {
         if (changeState === 'status' && child.disabled) return;
         child[changeState] = node[changeState];
         this.markWillUpdateNode(child);
         this.walkDown(child, changeState);
      });
   }
};

NativeCheckBoxTree.prototype.updateLiElement = function(node) {
   const {classList} = this.liElementsById[node.id];
   const checkBoxEl = this.checkboxElementsById[node.id];

   switch (node.status) {
   case 0:
      classList.remove(
         'NCT-node__halfchecked',
         'NCT-node__checked'
      );
      checkBoxEl.indeterminate = false;
      checkBoxEl.checked = false; // IMPORTANT: use el.checked to prevent mutation event fire
      break;
   case 1:
      classList.remove('NCT-node__checked');
      checkBoxEl.checked = false;
      classList.add('NCT-node__halfchecked');
      checkBoxEl.indeterminate = true;
      break;
   case 2:
      classList.remove('NCT-node__halfchecked');
      checkBoxEl.indeterminate = false;
      classList.add('NCT-node__checked');
      checkBoxEl.checked = true;
      break;
   }

   switch (node.disabled) {
   case true:
      if (!classList.contains('NCT-node__disabled')) {
         classList.add('NCT-node__disabled');
         checkBoxEl.disabled = true;
      }
      break;
   case false:
      if (classList.contains('NCT-node__disabled')) {
         classList.remove('NCT-node__disabled');
         checkBoxEl.disabled = false;
      }
      break;
   }
};

NativeCheckBoxTree.parseTreeData = function(data) {
   const treeNodes = deepClone(data);
   const nodesById = {};
   const leafNodesById = {};
   const values = [];
   const disables = [];
   const walkTree = function(nodes, parent) {
      nodes.forEach(node => {
         nodesById[node.id] = node;
         if (node.checked) values.push(node.id);
         if (node.disabled) disables.push(node.id);
         if (parent) node.parent = parent;
         if (node.children && node.children.length) {
            walkTree(node.children, node);
         } else {
            leafNodesById[node.id] = node;
         }
      });
   };
   walkTree(treeNodes);
   return {
      treeNodes,
      nodesById,
      leafNodesById,
      defaultValues: values,
      defaultDisables: disables,
   };
};

NativeCheckBoxTree.createRootEle = function() {
   const div = document.createElement('div');
   div.classList.add('NCT');
   return div;
};

NativeCheckBoxTree.createUlEle = function() {
   const ul = document.createElement('ul');
   ul.classList.add('NCT-nodes');
   return ul;
};

NativeCheckBoxTree.createLiEle = function(node, closed, chkBoxName) {
   const li = document.createElement('li');
   li.classList.add('NCT-node');
   if (closed) li.classList.add('NCT-node__close');
   if (node.children && node.children.length) {
      const switcher = document.createElement('span');
      switcher.classList.add('NCT-switcher');
      li.appendChild(switcher);
   } else {
      li.classList.add('NCT-placeholder');
   }

   const label = document.createElement('label');
   label.classList.add('NCT-label');
   const checkbox = document.createElement('input');
   checkbox.type = 'checkbox';
   checkbox.dataset.id = node.id; // FIXME: < IE11
   if (!node.children) {
      if (chkBoxName) {
         checkbox.name = chkBoxName + '[]';
      }
      checkbox.value = node.id;
   }
   checkbox.classList.add('NCT-checkbox');
   label.appendChild(checkbox);
   const text = document.createTextNode(node.text);
   label.appendChild(text);

   li.appendChild(label);
   li.dataset.id = node.id;

   return [li, checkbox];
};

// https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
NativeCheckBoxTree.prototype.createObserver = function() {
   // Options for the observer (which mutations to observe)
   const config = {
      attributes: true,
      childList: false,
      subtree: true,
      characterData: false,
      attributeFilter: ['checked'],
   };

   // Callback function to execute when mutations are observed
   const callback = function(mutationsList /*, observer */) {
      // Use traditional 'for loops' for IE 11
      for (const mutation of mutationsList) {
         if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'checked' &&
            mutation.target.tagName === 'INPUT' &&
            mutation.target.type === 'checkbox'
         ) {
            const node = this.nodesById[mutation.target.dataset.id];
            const nodeChecked = node.status === 1 || node.status === 2;
            const elementChecked = parseBoolean(
               mutation.target.getAttribute(mutation.attributeName)
            );
            // console.log(`status ${node.status}/${nodeChecked}, element ${mutation.target.getAttribute(mutation.attributeName)}/${elementChecked}`);
            if (nodeChecked !== elementChecked) {
               this.onItemClick(mutation.target.dataset.id);
            }
         }
      }
   };

   // Create an observer instance linked to the callback function
   this.observer = new MutationObserver(callback.bind(this));

   // Start observing the target node for configured mutations
   this.observer.observe(this.treeEle, config);
};

NativeCheckBoxTree.prototype.dispose = function() {
   // Later, you can stop observing
   this.observer && this.observer.disconnect();
};
