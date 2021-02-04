/**
 * Routing Information Modeling Language
 *
 * A YAML-based format for describing routing information.
 * Can be used for several purposes. This library is an implementation of the
 * core specification. Look in the 'lib' directory for libraries that
 * perform actions based on an initialized RIML object.
 *
 * In addition to this Node.js implementation, I am writing a PHP one too.
 *
 * It's loosely inspired by RAML.
 */

/**
 * The RIML version.
 */
const RIML_VERSION = '1.0-DRAFT-11';

/**
 * Properties allowed in root document, and Route documents.
 */
const RIML_COMMON_PROPS =
[
  'title', 'description', 'controller', 'method', 'apiType', 'authType',
];

/**
 * Properties allowed in Route documents.
 */
const RIML_ROUTE_PROPS =
[
  'name', 'path', 'http', 'responseSchema', 'requestSchema', 'responseCodes',
  'pathParams', 'queryParams', 'headers', 'tests', 'examples',
  'defaultRoute', 'redirect',  'redirectRoute',
  'virtual', 'noPath',
];

/**
 * Route Properties that are a map of objects.
 */
const RIML_ROUTE_OBJECT_MAP =
{
  pathParams:     RimlParam,
  queryParams:    RimlParam,
  headers:        RimlParam,
  responseCodes:  RimlResponseCodes,
};

/**
 * Route Properties that are an array of objects.
 */
const RIML_ROUTE_OBJECT_ARRAY =
{
  tests:    RimlTest,
  examples: RimlExample,
};

/**
 * Allowed HTTP methods as virtual properties.
 */
const RIML_HTTP_PROPS =
[
  'GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'HEAD'
];

/**
 * Allowed API types as virtual properties.
 */
const RIML_API_PROPS =
[
  'json', 'xml',
];

/**
 * Properties allowed in Parameters (queryParams, pathParams, headers.)
 */
const RIML_PARAM_PROPS =
[
  'title', 'description', 'type', 'required', 'multiple',
];

/**
 * Properties allowed in RimlExampe documents.
 */
const RIML_EXAMPLE_PROPS =
[
  'title', 'description', 'request', 'response',
];

/**
 * Properties allowed in RimlTest documents (extension of RimlExample.)
 */
const RIML_TEST_PROPS =
[
  'validateRequest', 'validateResponse', 'authOptions',
];

/**
 * Example/Test properties that are nested objects.
 */
const RIML_EXAMPLE_OBJECTS =
{
  request:  RimlRequest,
  response: RimlResponse,
};

/**
 * Properties allowed in RimlResponseCodes.
 */
const RIML_REPONSE_CODE_PROPS =
[
  'description', 'success', 'bodySchema',
];

/**
 * Properties allowed in RimlRequest documents.
 *
 * apiType and authType are string values that force the use in a RimlTest.
 * They are not applicable to RimlExample objects.
 * If omitted, the test framework will determine which type to use.
 */
const RIML_REQUEST_PROPS =
[
  'http', 'body', 'pathParams', 'queryParams', 'headers', 'apiType', 'authType'
];

/**
 * Properties allowed in RimlResponse documents.
 */
const RIML_RESPONSE_PROPS =
[
  'code', 'body', 'type', 'class',
];

var path = require('path');
var fs   = require('fs');
var yaml = require('js-yaml');

function addRoutes (routes)
{
  for (var rname in routes)
  {
    var rdef = routes[rname];
    if (rdef === undefined || rdef === null) continue;
    if (rname.substr(0,1) === '.')
    {
      var oname = rname.substr(1);
      this.options[oname] = rdef;
      continue;
    }
    var route = new RimlRoute(rname, rdef, this);
    this.routes.push(route);
  }
}

function hasRoutes ()
{
  return (this.routes.length > 0);
}

function RIML (source)
{
  this.root = this; // Magical recursion.
  this.routes = [];
  this.options = {};
  this.confdir = null;
  this.traits = {};
  this.method_prefix = 'handle_';
  this.included = {};
  this.sources = {};
  this._schemas = {};

  var stype = typeof source;
  if (stype === 'string')
  { // Assume the filename.
    source = this.loadFile(source);
  }
  else if (stype === 'object')
  {
    if ('dir' in source)
    {
      this.confdir = source.dir;
    }
    if ('prefix' in source)
    {
      this.method_prefix = source.prefix;
    }
    if ('file' in source)
    {
      source = this.loadFile(source.file);
    }
    else if ('text' in source)
    {
      source = this.loadText(source.text);
    }
    else if ('data' in source)
    {
      source = source.data;
    }
    else
    {
      throw new Error("Invalid named parameter sent to RIML() constructor.");
    }
  }
  else
  {
    throw new Error("Invalid data passed to RIML() constructor.");
  }

  for (var p in RIML_COMMON_PROPS)
  {
    var pname = RIML_COMMON_PROPS[p];
    if (pname in source)
    {
      this[pname] = source[pname];
      delete source[pname];
    }
  }

  this.addRoutes(source);
}

RIML.prototype.addRoutes = addRoutes;

RIML.prototype.hasRoutes = hasRoutes;

RIML.prototype.version = function ()
{
  return RIML_VERSION;
}

RIML.prototype.loadFile = function (filename)
{
  var confdir = path.dirname(filename);
  if (this.confdir === null)
    this.confdir = confdir;
  var text = fs.readFileSync(filename, 'utf8');
  return this.loadText(text, confdir);
}

RIML.prototype.buildSchema = function (confdir)
{
  var self = this; // a reference for callbacks.

  if (confdir === null || confdir === undefined)
  {
    confdir = this.confdir;
  }

  var INCLUDE = new yaml.Type('!include',
  {
    kind: 'scalar',
    construct: function (data)
    {
      return self.includeFile(data, confdir, true);
    },
  });
  var INCLUDEPATH = new yaml.Type('!includePath',
  {
    kind: 'scalar',
    construct: function (data)
    {
      return self.includeFile(data, confdir, false);
    },
  });
  var DEFINE = new yaml.Type('!define',
  {
    kind: 'mapping',
    construct: function (data)
    {
      return self.defineMetadata(data);
    },
  });
  var USE = new yaml.Type('!use',
  {
    kind: 'mapping',
    construct: function (data)
    {
      return self.useMetadata(data);
    },
  });
  var CONTROLLER = new yaml.Type('!controller',
  {
    kind: 'mapping',
    construct: function (data)
    {
      if (data === null)
        data = {};
      data['.controller'] = true;
      return data;
    },
  });
  var METHOD = new yaml.Type('!method',
  {
    kind: 'mapping',
    construct: function (data)
    {
      if (data === null)
        data = {};
      data['.method'] = true;
      return data;
    },
  });
  var VIRTUAL = new yaml.Type('!virtual',
  {
    kind: 'mapping',
    construct: function (data)
    {
      if (data === null)
        data = {};
      data['virtual'] = true;
      return data;
    },
  });

  var handlers = 
  [
    INCLUDE, 
    INCLUDEPATH, 
    DEFINE, 
    USE, 
    CONTROLLER, 
    METHOD, 
    VIRTUAL
  ];
  
  return yaml.Schema.create(handlers);
}

RIML.prototype.getSchema = function (confdir)
{
  var schemaname = (typeof confdir === 'string') ? confdir : '_';
  if (this._schemas[schemaname] === undefined)
  {
    this._schemas[schemaname] = this.buildSchema(confdir);
  }
  return this._schemas[schemaname];
}

RIML.prototype.loadText = function (text, confdir)
{
  var schema = this.getSchema(confdir);
  return yaml.load(text, { schema: schema });
}

RIML.prototype.includeFile = function (filename, confdir, setNoPath)
{
  if (!confdir)
  {
    confdir = this.confdir;
  }

  if ((typeof confdir === 'string') && filename.substr(0,1) === '/')
  { // The filename is relative to the current confdir.
    filename = path.join(confdir, filename);
  }

  if (filename in this.included)
  {
    if (this.included[filename])
      return null;
    else if (filename in this.sources)
      return this.sources[filename];
  }
  var yaml = this.loadFile(filename);
  var mark = true;
  if (typeof yaml === 'object' && yaml !== null)
  {
    if (!('virtual' in yaml))
    {
      yaml.virtual = true;
    }
    if (setNoPath && !('noPath' in yaml))
    {
      yaml.noPath = true;
    }
    if (yaml['.includePoly'])
    {
      mark = false;
      this.sources[filename] = yaml;
    }
  }
  this.included[filename] = mark;
  return yaml;
}

RIML.prototype.defineMetadata = function (data)
{
  if (typeof data === 'object' && data !== null)
  {
    if ('.trait' in data)
    {
      var name = data['.trait'];
      delete data['.trait'];
      this.traits[name] = data;
    }
  }
  return null;
}

RIML.prototype.useMetadata = function (data)
{
  if (typeof data !== 'object' || data === null) return null;
  if ('.traits' in data)
  {
    var traits = data[tprop];
    delete data[tprop];
    if (typeof traits === 'string')
      traits = [traits];
    else if (typeof traits !== 'object' && traits.length)
      return; // We can do no more.
    for (var t in traits)
    {
      var tname = traits[t];
      if (tname in this.traits)
      {
        var trait = JSON.parse(JSON.stringify(this.traits[tname])); // clone
        var consumed = {};
        for (var tprop in trait)
        {
          if (tprop == '.placeholders') continue;
          if (tprop == '.vars')
          {
            if (data[tprop] === undefined)
            {
              data[tprop] = trait[tprop];
            }
            else
            {
              for (var vname in trait[tprop])
              {
                if (data[tprop][vname] === undefined)
                {
                  data[tprop][vname] = trait[tprop][vname];
                }
              }
            }
          }
          else
          {
            if (data[tprop] === undefined)
            {
              data[tprop] = trait[tprop];
              consumed[tprop] = true;
            }
            else
            {
              consumed[tprop] = false;
            }
          }
        }
        this.handlePlaceholders(data, trait, consumed);
      }
    }
  }
  return data;
}

RIML.prototype.handlePlaceholders = function (data, trait, consumed)
{
  if ('.placeholders' in trait && typeof trait['.placeholders'] === 'object')
  { // Expand variables.
    var vars = trait['.placeholders'];
    for (var varname in vars)
    {
      if (varname == '.vars') continue; // sanity check.
      if ('.vars' in data && varname in data['.vars'])
      {
        var value = data['.vars'][varname];
        var varpathspec = vars[varname];
        if (typeof varpathspec === 'string')
          varpathspec = [varpathspec];
        for (var v in varpathspec)
        {
          var varpath = varpathspec[v];
          var varpaths = varpath.replace(/^\||\|$/gm, '').split('|');
          var firstitem = varpaths[0];
          if (consumed[firstitem] === false)
          { // the path was seen, but not consumed, skip it.
            continue;
          }
          var tdata = data;
          var lastitem = varpaths.pop();
          var textitem = null;
          for (var vp in varpaths)
          {
            var varp = varpaths[vp];
            if (varp in tdata)
            {
              if (typeof tdata[varp] === 'string')
              {
                textitem = varp;
                break;
              }
              else if (typeof tdata[varp] === 'object')
              {
                tdata = tdata[varp];
              }
              else
              {
                throw new Error("Invalid variable path spec: "+varpath);
              }
            }
          }
          if (textitem !== null)
          {
            tdata[textitem] = tdata[textitem].replace(lastitem, value);
          }
          else if (lastitem in tdata)
          {
            tdata[lastitem] = value;
          }
        }
      }
      else
      {
        throw new Error("Unfulfilled variable "+varname+" in use statement.");
      }
    }
  }
}

function RimlRoute (rname, rdef, parent)
{
  if (typeof rdef !== 'object')
    rdef = {};
  this.route_name = rname;
  this.parent = parent;
  this.root = parent.root;
  this.routes = [];
  this.options = {};
  this.virtual = false;
  this.noPath  = false;
  this.defaultRoute = false;
  var propsrcs = [RIML_COMMON_PROPS, RIML_ROUTE_PROPS]
  for (var ps in propsrcs)
  {
    var psrc = propsrcs[ps];
    for (var p in psrc)
    {
      var pname = psrc[p];
      if (pname in rdef)
      {
        if (pname in RIML_ROUTE_OBJECT_MAP)
        {
          var classname = RIML_ROUTE_OBJECT_MAP[pname];
          this[pname] = {};
          for (var mapname in rdef[pname])
          {
            this[pname][mapname] = new classname(rdef[pname][mapname], this);
          }
        }
        else if (pname in RIML_ROUTE_OBJECT_ARRAY)
        {
          var classname = RIML_ROUTE_OBJECT_ARRAY[pname];
          this[pname] = [];
          for (var arraykey in rdef[pname])
          {
            this[pname].push(new classname(rdef[pname][arraykey], this));
          }
        }
        else
        {
          this[pname] = rdef[pname];
        }
        delete rdef[pname];
      }
    }
  }
  if ('.controller' in rdef && rdef['.controller'] && !('controller' in this))
  {
    this.controller = rname;
  }
  else if ('.method' in rdef && rdef['.method'] && !('method' in this))
  {
    this.method = rname;
  }
  if (!('path' in this) && !this.noPath)
  {
    this.path = rname;
  }
  for (var h in RIML_HTTP_PROPS)
  {
    var hname = RIML_HTTP_PROPS[h];
    if (hname in rdef)
    {
      if (typeof rdef[hname] !== 'object')
        rdef[hname] = {};
      rdef[hname].http = hname;
      if (!('path' in rdef[hname]))
        rdef[hname].path = false; // force parent path use.
    }
  }
  for (var a in RIML_API_PROPS)
  {
    var aname = RIML_API_PROPS[a];
    if (aname in rdef)
    {
      if (typeof rdef[aname] !== 'object')
        rdef[aname] = {};
      rdef[aname].apiType = aname;
      if (!('path' in rdef[hname]))
        rdef[hname].path = false;
    }
  }
  this.addRoutes(rdef);
}

RimlRoute.prototype.addRoutes = addRoutes;

RimlRoute.prototype.hasRoutes = hasRoutes;

function loadDef (eobj, edef, props, oprops)
{
  for (var p in props)
  {
    var pname = props[p];
    if (pname in edef)
    {
      if (oprops && pname in oprops)
      {
        eobj[pname] = new oprops(edef[pname], eobj);
      }
      else
      {
        eobj[pname] = edef[pname];
      }
    }
  }
}

function RimlParam (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  loadDef(this, data, RIML_PARAM_PROPS);
}

function RimlExample (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  loadDef(this, data, RIML_EXAMPLE_PROPS, RIML_EXAMPLE_OBJECTS);
}

function RimlTest (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  var props = RIML_EXAMPLE_PROPS.concat(RIML_TEST_PROPS);
  loadDef(this, data, props, RIML_EXAMPLE_OBJECTS);
}

function RimlResponseCodes (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  loadDef(this, data, RIML_RESPONSE_CODE_PROPS);
}

function RimlRequest (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  loadDef(this, data, RIML_REQUEST_PROPS);
}

function RimlResponse (data, parent)
{
  this.parent = parent;
  this.root   = parent.root;
  loadDef(this, data, RIML_RESPONSE_PROPS);
}

module.exports = RIML;

