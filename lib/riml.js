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
const RIML_VERSION = '1.0-DRAFT-8';

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
  this.templates = {};
  this.traits = {};
  this.method_prefix = 'handle_';
  this.included = {};
  this.sources = {};

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
  if (this.confdir === null)
    this.confdir = path.dirname(filename);
  var text = fs.readFileSync(filename, 'utf8');
  return this.loadText(text);
}

RIML.prototype.setupYaml = function ()
{
  var self = this; // a reference for callbacks.
  var INCLUDE = new yaml.Type('!include',
  {
    kind: 'scalar',
    construct: function (data)
    {
      return self.includeFile(data, true);
    },
  });
  var INCLUDEPATH = new yaml.Type('!includePath',
  {
    kind: 'scalar',
    construct: function (data)
    {
      return self.includeFile(data, false);
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
  var handlers = [INCLUDE, DEFINE, USE, CONTROLLER, METHOD, VIRTUAL];
  this.RIML_SCHEMA = yaml.Schema.create(handlers);
}

RIML.prototype.loadText = function (text)
{
  if (this.RIML_SCHEMA === undefined)
    this.setupYaml();
  return yaml.load(text, { schema: this.RIML_SCHEMA });
}

RIML.prototype.includeFile = function (filename, setNoPath)
{
  if (filename.indexOf('/') === -1 && this.confdir !== null)
  {
    filename = path.join(this.confdir, filename);
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
    if ('.template' in data && '.vars' in data)
    {
      var name = data['.template'];
      delete data['.template'];
      this.templates[name] = data;
    }
    else if ('.trait' in data)
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
  if (typeof data === 'object' && data !== null)
  {
    this.applyTraits(data, '.templateTraits');
    if ('.template' in data)
    {
      data = this.applyTemplate(data);
    }
    this.applyTraits(data, '.traits');
  }
  return data;
}

RIML.prototype.applyTraits = function (data, tprop)
{
  if (tprop in data)
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
        var trait = this.traits[tname];
        for (var tprop in trait)
        {
          data[tprop] = trait[tprop];
        }
      }
    }
  }
}

RIML.prototype.applyTemplate = function (data)
{
  var name = data['.template'];
  if (name in this.templates)
  {
    var template = JSON.parse(JSON.stringify(this.templates[name])); // clone
    var vars = template['.vars'];
    delete template['.vars'];
    for (var varname in vars)
    {
      if (varname in data)
      {
        var value = data[varname];
        var varpathspec = vars[varname];
        if (typeof varpathspec === 'string')
          varpathspec = [varpathspec];
        for (var v in varpathspec)
        {
          var varpath = varpathspec[v];
          var varpaths = varpath.replace(/^\/|\/$/gm, '').split('/');
          var tdata = template;
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
    if ('.traits' in data)
    { // Magic merging of traits.
      if ('.traits' in template)
      {
        if (typeof template['.traits'] === 'string')
          template['.traits'] = [template['.traits']];
        if (typeof data['.traits'] === 'string')
          data['.traits'] = [data['.traits']];
        for (var tr in data['.traits'])
          template['.traits'].push(data['.traits'][tr]);
      }
      else
      {
        template['.traits'] = data['.traits'];
      }
    }
    data = template;
  }
  else
  {
    throw new Error("Template "+name+" not found");
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

